from flask import jsonify, request
from flask_login import login_required

from redash.handlers.api import api
from redash.handlers.base import routes
from redash.handlers.digest_subscriptions import unsubscribe_view
from redash.monitor import get_status
from redash.permissions import require_super_admin
from redash.security import talisman


@routes.route("/ping", methods=["GET"])
@talisman(force_https=False)
def ping():
    return "PONG."


# Feature #219: token-based unsubscribe — no session required. The signature
# in `?sig=` is computed off the per-subscription token + SECRET_KEY so this
# endpoint is safe to expose unauthenticated.
@routes.route("/api/digest_subscriptions/unsubscribe", methods=["GET"])
@talisman(force_https=False)
def digest_unsubscribe():
    return unsubscribe_view()


@routes.route("/status.json")
@login_required
@require_super_admin
def status_api():
    status = get_status()
    return jsonify(status)


def init_app(app):
    from redash.handlers import (
        admin,
        authentication,
        embed,
        organization,
        queries,
        setup,
        static,
    )

    app.register_blueprint(routes)
    api.init_app(app)

    # JRNYBI: Return JSON error responses for API requests (instead of HTML)
    @app.errorhandler(401)
    def handle_unauthorized(e):
        if "/api/" in request.path:
            return jsonify({"message": e.description or "Authentication required."}), 401
        from flask import redirect
        from redash.authentication import get_login_url
        return redirect(get_login_url(next=request.url, external=False))
