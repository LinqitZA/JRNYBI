import { map } from "lodash";
import React from "react";
import PropTypes from "prop-types";

import Button from "antd/lib/button";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import Link from "@/components/Link";
import Paginator from "@/components/Paginator";
import { UserPreviewCard } from "@/components/PreviewCard";

import { wrap as itemsList, ControllerType } from "@/components/items-list/ItemsList";
import { ResourceItemsSource } from "@/components/items-list/classes/ItemsSource";
import { UrlStateStorage } from "@/components/items-list/classes/StateStorage";

import LoadingState from "@/components/items-list/components/LoadingState";
import EmptyState from "@/components/items-list/components/EmptyState";
import * as Sidebar from "@/components/items-list/components/Sidebar";
import ItemsTable, { Columns } from "@/components/items-list/components/ItemsTable";

import Layout from "@/components/layouts/ContentWithSidebar";
import wrapSettingsTab from "@/components/SettingsWrapper";

import { currentUser } from "@/services/auth";
import User from "@/services/user";
import routes from "@/services/routes";

function UsersListActions({ user, enableUser, disableUser }) {
  if (user.id === currentUser.id) {
    return null;
  }
  // JRNYBI: No delete for pending invitations - users auto-provisioned via JWT
  return user.is_disabled ? (
    <Button type="primary" className="w-100" onClick={event => enableUser(event, user)}>
      Enable
    </Button>
  ) : (
    <Button className="w-100" onClick={event => disableUser(event, user)}>
      Disable
    </Button>
  );
}

UsersListActions.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number,
    is_disabled: PropTypes.bool,
  }).isRequired,
  enableUser: PropTypes.func.isRequired,
  disableUser: PropTypes.func.isRequired,
};

class UsersList extends React.Component {
  static propTypes = {
    controller: ControllerType.isRequired,
  };

  sidebarMenu = [
    {
      key: "active",
      href: "users",
      title: "Active Users",
    },
    // JRNYBI: Pending Invitations removed - users auto-provisioned via JWT SSO
    {
      key: "disabled",
      href: "users/disabled",
      title: "Disabled Users",
      isAvailable: () => currentUser.isAdmin,
    },
  ];

  listColumns = [
    Columns.custom.sortable((text, user) => <UserPreviewCard user={user} withLink />, {
      title: "Name",
      field: "name",
      width: null,
    }),
    Columns.custom.sortable(
      (text, user) =>
        map(user.groups, group => (
          <Link key={"group" + group.id} className="label label-tag" href={"groups/" + group.id}>
            {group.name}
          </Link>
        )),
      {
        title: "Groups",
        field: "groups",
      }
    ),
    Columns.timeAgo.sortable({
      title: "Joined",
      field: "created_at",
      className: "text-nowrap",
      width: "1%",
    }),
    Columns.timeAgo.sortable({
      title: "Last Active At",
      field: "active_at",
      className: "text-nowrap",
      width: "1%",
    }),
    Columns.custom(
      (text, user) => (
        <UsersListActions
          user={user}
          enableUser={this.enableUser}
          disableUser={this.disableUser}
        />
      ),
      {
        width: "1%",
        isAvailable: () => currentUser.isAdmin,
      }
    ),
  ];

  // JRNYBI: User creation removed - users auto-provisioned via JWT SSO
  enableUser = (event, user) => User.enableUser(user).then(() => this.props.controller.update());

  disableUser = (event, user) => User.disableUser(user).then(() => this.props.controller.update());

  deleteUser = (event, user) => User.deleteUser(user).then(() => this.props.controller.update());

  render() {
    const { controller } = this.props;
    return (
      <React.Fragment>
        {/* JRNYBI: No "New User" button - users auto-provisioned via JWT SSO */}
        <Layout>
          <Layout.Sidebar className="m-b-0">
            <Sidebar.SearchInput
              value={controller.searchTerm}
              onChange={controller.updateSearch}
              label="Search users"
            />
            <Sidebar.Menu items={this.sidebarMenu} selected={controller.params.currentPage} />
          </Layout.Sidebar>
          <Layout.Content>
            {!controller.isLoaded && <LoadingState className="" />}
            {controller.isLoaded && controller.isEmpty && <EmptyState className="" />}
            {controller.isLoaded && !controller.isEmpty && (
              <div className="table-responsive" data-test="UserList">
                <ItemsTable
                  items={controller.pageItems}
                  columns={this.listColumns}
                  context={this.actions}
                  orderByField={controller.orderByField}
                  orderByReverse={controller.orderByReverse}
                  toggleSorting={controller.toggleSorting}
                />
                <Paginator
                  showPageSizeSelect
                  totalCount={controller.totalItemsCount}
                  pageSize={controller.itemsPerPage}
                  onPageSizeChange={itemsPerPage => controller.updatePagination({ itemsPerPage })}
                  page={controller.page}
                  onChange={page => controller.updatePagination({ page })}
                />
              </div>
            )}
          </Layout.Content>
        </Layout>
      </React.Fragment>
    );
  }
}

const UsersListPage = wrapSettingsTab(
  "Users.List",
  {
    permission: "admin",
    title: "Users",
    path: "users",
    isActive: path => path.startsWith("/users") && path !== "/users/me",
    order: 2,
  },
  itemsList(
    UsersList,
    () =>
      new ResourceItemsSource({
        getRequest(request, { params: { currentPage } }) {
          switch (currentPage) {
            case "active":
              request.pending = false;
              break;
            case "pending":
              request.pending = true;
              break;
            case "disabled":
              request.disabled = true;
              break;
            // no default
          }
          return request;
        },
        getResource() {
          return User.query.bind(User);
        },
      }),
    () => new UrlStateStorage({ orderByField: "created_at", orderByReverse: true })
  )
);

// JRNYBI: /users/new and /users/pending routes removed - users auto-provisioned via JWT SSO
routes.register(
  "Users.List",
  routeWithUserSession({
    path: "/users",
    title: "Users",
    render: pageProps => <UsersListPage {...pageProps} currentPage="active" />,
  })
);
routes.register(
  "Users.Disabled",
  routeWithUserSession({
    path: "/users/disabled",
    title: "Disabled Users",
    render: pageProps => <UsersListPage {...pageProps} currentPage="disabled" />,
  })
);
