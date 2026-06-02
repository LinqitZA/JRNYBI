"""
Digest subscription API (feature #219).

Routes (mounted in `redash/handlers/api.py`):
  GET  /api/digest_subscriptions             — list my subscriptions
  POST /api/digest_subscriptions             — create one
  DELETE /api/digest_subscriptions/<sub_id>  — cancel one (auth required)
  GET  /api/digest_subscriptions/unsubscribe — token-based (no auth)

The /unsubscribe endpoint is intentionally GET + tokenized so it works from
the email client without a session. It marks the subscription inactive and
returns a tiny HTML confirmation page.
"""
from flask import make_response, request
from flask_restful import abort

from redash import models
from redash.handlers.base import BaseResource
from redash.models.digest import (
    ALLOWED_FREQUENCIES,
    ALLOWED_TARGETS,
    DigestSubscription,
    FREQUENCY_DAILY,
)


def _validate_target(target_type, target_id, org):
    """Cheap permission gate — make sure the dashboard / query exists and
    belongs to the calling user's org. We don't check ACLs here; the
    pre-existing per-object resource handlers do that on each digest send.
    """
    if target_type == "query":
        q = models.Query.query.filter_by(id=int(target_id)).first()
        if not q or q.org_id != org.id:
            abort(404, message="Target query not found")
    elif target_type == "dashboard":
        d = models.Dashboard.query.filter_by(id=int(target_id)).first()
        if not d or d.org_id != org.id:
            abort(404, message="Target dashboard not found")
    else:
        abort(400, message="Invalid target_type")


class DigestSubscriptionListResource(BaseResource):
    def get(self):
        subs = DigestSubscription.all_for_user(self.current_user).all()
        return [s.to_dict() for s in subs]

    def post(self):
        body = request.get_json() or {}
        target_type = body.get("target_type")
        target_id = body.get("target_id")
        frequency = body.get("frequency", FREQUENCY_DAILY)
        delivery_hour = int(body.get("delivery_hour", 8))

        if target_type not in ALLOWED_TARGETS:
            abort(400, message=f"target_type must be one of {ALLOWED_TARGETS}")
        if frequency not in ALLOWED_FREQUENCIES:
            abort(400, message=f"frequency must be one of {ALLOWED_FREQUENCIES}")
        if target_id is None:
            abort(400, message="target_id required")

        _validate_target(target_type, target_id, self.current_org)

        # Upsert: re-activate if a deactivated one exists; otherwise create.
        existing = DigestSubscription.query.filter_by(
            user_id=self.current_user.id,
            target_type=target_type,
            target_id=int(target_id),
            frequency=frequency,
        ).first()
        if existing:
            existing.active = True
            existing.delivery_hour = delivery_hour
            models.db.session.commit()
            return existing.to_dict(), 200

        sub = DigestSubscription.create(
            user=self.current_user,
            target_type=target_type,
            target_id=int(target_id),
            frequency=frequency,
            delivery_hour=delivery_hour,
        )
        models.db.session.add(sub)
        models.db.session.commit()
        return sub.to_dict(), 201


class DigestSubscriptionResource(BaseResource):
    def delete(self, subscription_id):
        sub = DigestSubscription.query.filter_by(id=int(subscription_id)).first()
        if not sub or sub.user_id != self.current_user.id:
            abort(404, message="Subscription not found")
        sub.active = False
        models.db.session.commit()
        return {"success": True}


def unsubscribe_view():
    """Public, token-protected unsubscribe endpoint.

    Registered as a plain Flask route (not Flask-RESTful) so the response can
    be an HTML page instead of JSON. See `redash/handlers/__init__.py` for
    wiring.
    """
    sub_id = request.args.get("id")
    sig = request.args.get("sig")
    if not sub_id or not sig:
        return _unsubscribe_html("Invalid unsubscribe link.", success=False), 400

    sub = DigestSubscription.query.filter_by(id=int(sub_id)).first()
    if not sub or not sub.verify_unsubscribe_signature(sig):
        return _unsubscribe_html("This link is no longer valid.", success=False), 404

    sub.active = False
    models.db.session.commit()
    return _unsubscribe_html(
        f"You have been unsubscribed from the {sub.frequency} digest.",
        success=True,
    )


def _unsubscribe_html(message, success):
    color = "#117a3b" if success else "#b42318"
    html = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>JRNYBI — Unsubscribe</title></head>
    <body style="font-family:'Inter',Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:60px 20px;text-align:center">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e2e8f0">
        <div style="font-size:18px;font-weight:600;color:{color};margin-bottom:8px">JRNYBI Digest</div>
        <div style="color:#334155">{message}</div>
      </div>
    </body></html>
    """
    return make_response(html, 200, {"Content-Type": "text/html; charset=utf-8"})
