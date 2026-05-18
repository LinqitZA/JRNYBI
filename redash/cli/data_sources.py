import os
from sys import exit

import click
from click.types import convert_type
from flask.cli import AppGroup
from sqlalchemy.orm.exc import NoResultFound

from redash import models
from redash.query_runner import (
    get_configuration_schema_for_query_runner_type,
    query_runners,
)
from redash.utils import json_loads
from redash.utils.configuration import ConfigurationContainer

manager = AppGroup(help="Data sources management commands.")


@manager.command(name="list")
@click.option(
    "--org",
    "organization",
    default=None,
    help="The organization the user belongs to (leave blank for " "all organizations).",
)
def list_command(organization=None):
    """List currently configured data sources."""
    if organization:
        org = models.Organization.get_by_slug(organization)
        data_sources = models.DataSource.query.filter(models.DataSource.org == org)
    else:
        data_sources = models.DataSource.query
    for i, ds in enumerate(data_sources.order_by(models.DataSource.name)):
        if i > 0:
            print("-" * 20)

        print("Id: {}\nName: {}\nType: {}\nOptions: {}".format(ds.id, ds.name, ds.type, ds.options.to_json()))


@manager.command(name="list_types")
def list_types():
    print("Enabled Query Runners:")
    types = sorted(query_runners.keys())
    for query_runner_type in types:
        print(query_runner_type)
    print("Total of {}.".format(len(types)))


def validate_data_source_type(type):
    if type not in query_runners.keys():
        print(
            'Error: the type "{}" is not supported (supported types: {}).'.format(
                type, ", ".join(query_runners.keys())
            )
        )
        print("OJNK")
        exit(1)


@manager.command()
@click.argument("name")
@click.option(
    "--org",
    "organization",
    default="default",
    help="The organization the user belongs to " "(leave blank for 'default').",
)
def test(name, organization="default"):
    """Test connection to data source by issuing a trivial query."""
    try:
        org = models.Organization.get_by_slug(organization)
        data_source = models.DataSource.query.filter(
            models.DataSource.name == name, models.DataSource.org == org
        ).one()
        print("Testing connection to data source: {} (id={})".format(name, data_source.id))
        try:
            data_source.query_runner.test_connection()
        except Exception as e:
            print("Failure: {}".format(e))
            exit(1)
        else:
            print("Success")
    except NoResultFound:
        print("Couldn't find data source named: {}".format(name))
        exit(1)


@manager.command()
@click.argument("name", default=None, required=False)
@click.option("--type", default=None, help="new type for the data source")
@click.option("--options", default=None, help="updated options for the data source")
@click.option(
    "--org",
    "organization",
    default="default",
    help="The organization the user belongs to (leave blank for " "'default').",
)
def new(name=None, type=None, options=None, organization="default"):
    """Create new data source."""

    if name is None:
        name = click.prompt("Name")

    if type is None:
        print("Select type:")
        for i, query_runner_name in enumerate(query_runners.keys()):
            print("{}. {}".format(i + 1, query_runner_name))

        idx = 0
        while idx < 1 or idx > len(list(query_runners.keys())):
            idx = click.prompt("[{}-{}]".format(1, len(query_runners.keys())), type=int)

        type = list(query_runners.keys())[idx - 1]
    else:
        validate_data_source_type(type)

    query_runner = query_runners[type]
    schema = query_runner.configuration_schema()

    if options is None:
        types = {"string": str, "number": int, "boolean": bool}

        options_obj = {}

        for k, prop in schema["properties"].items():
            required = k in schema.get("required", [])
            default_value = "<<DEFAULT_VALUE>>"
            if required:
                default_value = None

            prompt = prop.get("title", k.capitalize())
            if required:
                prompt = "{} (required)".format(prompt)
            else:
                prompt = "{} (optional)".format(prompt)

            _type = types[prop["type"]]

            def value_proc(value):
                if value == default_value:
                    return default_value
                return convert_type(_type, default_value)(value)

            value = click.prompt(
                prompt,
                default=default_value,
                type=_type,
                show_default=False,
                value_proc=value_proc,
            )
            if value != default_value:
                options_obj[k] = value

        options = ConfigurationContainer(options_obj, schema)
    else:
        options = ConfigurationContainer(json_loads(options), schema)

    if not options.is_valid():
        print("Error: invalid configuration.")
        exit(1)

    print("Creating {} data source ({}) with options:\n{}".format(type, name, options.to_json()))

    data_source = models.DataSource.create_with_group(
        name=name,
        type=type,
        options=options,
        org=models.Organization.get_by_slug(organization),
    )
    models.db.session.commit()
    print("Id: {}".format(data_source.id))


@manager.command()
@click.argument("name")
@click.option(
    "--org",
    "organization",
    default="default",
    help="The organization the user belongs to (leave blank for " "'default').",
)
def delete(name, organization="default"):
    """Delete data source by name."""
    try:
        org = models.Organization.get_by_slug(organization)
        data_source = models.DataSource.query.filter(
            models.DataSource.name == name, models.DataSource.org == org
        ).one()
        print("Deleting data source: {} (id={})".format(name, data_source.id))
        models.db.session.delete(data_source)
        models.db.session.commit()
    except NoResultFound:
        print("Couldn't find data source named: {}".format(name))
        exit(1)


def update_attr(obj, attr, new_value):
    if new_value is not None:
        old_value = getattr(obj, attr)
        print("Updating {}: {} -> {}".format(attr, old_value, new_value))
        setattr(obj, attr, new_value)


@manager.command()
@click.argument("name")
@click.option("--name", "new_name", default=None, help="new name for the data source")
@click.option("--options", default=None, help="updated options for the data source")
@click.option("--type", default=None, help="new type for the data source")
@click.option(
    "--org",
    "organization",
    default="default",
    help="The organization the user belongs to (leave blank for " "'default').",
)
def edit(name, new_name=None, options=None, type=None, organization="default"):
    """Edit data source settings (name, options, type)."""
    try:
        if type is not None:
            validate_data_source_type(type)
        org = models.Organization.get_by_slug(organization)
        data_source = models.DataSource.query.filter(
            models.DataSource.name == name, models.DataSource.org == org
        ).one()
        update_attr(data_source, "name", new_name)
        update_attr(data_source, "type", type)

        if options is not None:
            schema = get_configuration_schema_for_query_runner_type(data_source.type)
            options = json_loads(options)
            data_source.options.set_schema(schema)
            data_source.options.update(options)

        models.db.session.add(data_source)
        models.db.session.commit()

    except NoResultFound:
        print("Couldn't find data source named: {}".format(name))


@manager.command(name="seed_jrny")
@click.option(
    "--org",
    "organization",
    default="default",
    help="The organization to add the data source to (default: 'default').",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Recreate the data source even if one already exists.",
)
def seed_jrny(organization="default", force=False):
    """Seed the JRNY PostgreSQL (RLS) read-replica data source.

    Creates a pre-configured data source of type 'jrny_pg' pointing to the
    JRNY ERP read-replica. Connection details are read from environment
    variables:

    \b
      JRNYBI_JRNY_REPLICA_HOST   (default: pg-replica)
      JRNYBI_JRNY_REPLICA_PORT   (default: 5432)
      JRNYBI_JRNY_REPLICA_DB     (default: jrny_db)
      JRNYBI_JRNY_REPLICA_USER   (default: jrnybi_reader)
      JRNYBI_JRNY_REPLICA_PASSWORD
    """
    ds_name = "JRNY Read Replica"
    ds_type = "jrny_pg"

    if ds_type not in query_runners:
        print(
            "Error: '{}' query runner is not registered. "
            "Ensure 'redash.query_runner.jrny_pg' is in QUERY_RUNNERS.".format(ds_type)
        )
        exit(1)

    try:
        org = models.Organization.get_by_slug(organization)
    except NoResultFound:
        print("Error: organization '{}' not found. Run 'manage org create' first.".format(organization))
        exit(1)

    # Check if the JRNY data source already exists
    existing = models.DataSource.query.filter(
        models.DataSource.org == org,
        models.DataSource.type == ds_type,
    ).first()

    if existing and not force:
        print(
            "JRNY data source already exists: '{}' (id={}). "
            "Use --force to recreate.".format(existing.name, existing.id)
        )
        return

    if existing and force:
        print("Removing existing JRNY data source: '{}' (id={})".format(existing.name, existing.id))
        models.db.session.delete(existing)
        models.db.session.commit()

    # Read connection details from environment variables
    replica_host = os.environ.get("JRNYBI_JRNY_REPLICA_HOST", "pg-replica")
    replica_port = int(os.environ.get("JRNYBI_JRNY_REPLICA_PORT", "5432"))
    replica_db = os.environ.get("JRNYBI_JRNY_REPLICA_DB", "jrny_db")
    replica_user = os.environ.get("JRNYBI_JRNY_REPLICA_USER", "jrnybi_reader")
    replica_password = os.environ.get("JRNYBI_JRNY_REPLICA_PASSWORD", "")

    schema = query_runners[ds_type].configuration_schema()

    options_dict = {
        "host": replica_host,
        "port": replica_port,
        "dbname": replica_db,
        "user": replica_user,
        "password": replica_password,
        "search_path": "reporting,core,sales,finance,inventory,procurement,cashbook",
        "sslmode": "prefer",
        "dsn": "application_name=jrnybi",
    }

    options = ConfigurationContainer(options_dict, schema)

    print("Creating JRNY data source '{}' (type={})".format(ds_name, ds_type))
    print("  Host: {}:{}".format(replica_host, replica_port))
    print("  Database: {}".format(replica_db))
    print("  User: {}".format(replica_user))
    print("  Search Path: {}".format(options_dict["search_path"]))

    data_source = models.DataSource.create_with_group(
        name=ds_name,
        type=ds_type,
        options=options,
        org=org,
    )
    models.db.session.commit()

    print("Success! Data source created with id={}".format(data_source.id))
