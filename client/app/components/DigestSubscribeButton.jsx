/**
 * DigestSubscribeButton (feature #219)
 *
 * Drop-in button + popover that lets the user opt in to a daily or weekly
 * insight digest for a dashboard or a single KPI query.
 *
 * Props:
 *   targetType : "dashboard" | "query"   — what they're subscribing to
 *   targetId   : number                  — the dashboard/query id
 *   className  : string                  — passthrough to the host <Button>
 *
 * Wire to the backend at /api/digest_subscriptions (see redash.handlers.
 * digest_subscriptions).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import Button from "antd/lib/button";
import Popover from "antd/lib/popover";
import Select from "antd/lib/select";
import notification from "@/services/notification";
import { axios } from "@/services/axios";

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, "0")}:00 UTC`,
}));

export default function DigestSubscribeButton({ targetType, targetId, className }) {
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [deliveryHour, setDeliveryHour] = useState(8);
  const [mySubs, setMySubs] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshMine = useCallback(() => {
    axios.get("/api/digest_subscriptions").then((subs) => {
      setMySubs(Array.isArray(subs) ? subs : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refreshMine();
  }, [refreshMine]);

  const subscribedSub = useMemo(
    () =>
      mySubs.find(
        (s) =>
          s.target_type === targetType &&
          String(s.target_id) === String(targetId) &&
          s.frequency === frequency &&
          s.active
      ),
    [mySubs, targetType, targetId, frequency]
  );

  const isSubscribed = !!subscribedSub;

  const subscribe = () => {
    setLoading(true);
    axios
      .post("/api/digest_subscriptions", {
        target_type: targetType,
        target_id: targetId,
        frequency,
        delivery_hour: deliveryHour,
      })
      .then(() => {
        notification.success("Subscribed", `You will receive a ${frequency} digest.`);
        setOpen(false);
        refreshMine();
      })
      .catch((err) => {
        const msg = (err && err.message) || "Failed to subscribe";
        notification.error("Subscribe failed", msg);
      })
      .finally(() => setLoading(false));
  };

  const unsubscribe = () => {
    if (!subscribedSub) return;
    setLoading(true);
    axios
      .delete(`/api/digest_subscriptions/${subscribedSub.id}`)
      .then(() => {
        notification.success("Unsubscribed", "You will no longer receive this digest.");
        setOpen(false);
        refreshMine();
      })
      .catch((err) => {
        const msg = (err && err.message) || "Failed to unsubscribe";
        notification.error("Unsubscribe failed", msg);
      })
      .finally(() => setLoading(false));
  };

  const panel = (
    <div style={{ width: 240 }}>
      <div style={{ marginBottom: 8, fontSize: 12, color: "#64748b" }}>
        Receive an email with delta, top contributors, and a sparkline.
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", fontSize: 12 }}>Frequency</label>
        <Select
          value={frequency}
          onChange={setFrequency}
          options={FREQUENCIES}
          style={{ width: "100%" }}
          data-test="DigestSubscribe.Frequency"
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12 }}>Delivery Hour (UTC)</label>
        <Select
          value={deliveryHour}
          onChange={setDeliveryHour}
          options={HOUR_OPTIONS}
          style={{ width: "100%" }}
          data-test="DigestSubscribe.Hour"
        />
      </div>
      {isSubscribed ? (
        <Button danger block onClick={unsubscribe} loading={loading} data-test="DigestSubscribe.Unsubscribe">
          Unsubscribe ({frequency})
        </Button>
      ) : (
        <Button type="primary" block onClick={subscribe} loading={loading} data-test="DigestSubscribe.Confirm">
          Subscribe ({frequency})
        </Button>
      )}
    </div>
  );

  return (
    <Popover
      visible={open}
      onVisibleChange={setOpen}
      content={panel}
      trigger="click"
      placement="bottomRight">
      <Button className={className} data-test="DigestSubscribe.Trigger">
        <i className="fa fa-envelope-o m-r-5" aria-hidden="true" />
        {isSubscribed ? "Subscribed" : "Subscribe to digest"}
      </Button>
    </Popover>
  );
}

DigestSubscribeButton.propTypes = {
  targetType: PropTypes.oneOf(["dashboard", "query"]).isRequired,
  targetId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  className: PropTypes.string,
};

DigestSubscribeButton.defaultProps = {
  className: "",
};
