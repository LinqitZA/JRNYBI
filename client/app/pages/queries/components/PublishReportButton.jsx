import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Button from "antd/lib/button";
import Modal from "antd/lib/modal";
import Select from "antd/lib/select";
import notification from "@/services/notification";
import { axios } from "@/services/axios";
import navigateTo from "@/components/ApplicationArea/navigateTo";

function PublishReportModal({ visible, onClose, visualization, query }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(
    visualization?.options?.reportCategory || ""
  );
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setCategoriesLoading(true);
      axios
        .get("api/jrny/report-categories")
        .then((data) => {
          setCategories(data.categories || []);
          // Pre-select from visualization options if available
          if (visualization?.options?.reportCategory) {
            setSelectedCategory(visualization.options.reportCategory);
          }
        })
        .catch(() => {
          notification.error("Failed to load report categories.");
        })
        .finally(() => {
          setCategoriesLoading(false);
        });
    }
  }, [visible, visualization]);

  const handlePublish = useCallback(async () => {
    if (!selectedCategory) {
      notification.warning("Please select a report category.");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create a dashboard (tags not supported in create, set them in step 3)
      const dashboardName = `${query.name} Report`;
      const dashboardData = await axios.post("api/dashboards", {
        name: dashboardName,
      });

      const dashboardId = dashboardData.id;
      const dashboardVersion = dashboardData.version || 1;

      // Step 2: Add the visualization as a widget
      await axios.post("api/widgets", {
        dashboard_id: dashboardId,
        visualization_id: visualization.id,
        options: {
          position: {
            col: 0,
            row: 0,
            sizeX: 6,
            sizeY: 16,
            autoHeight: true,
          },
          parameterMappings: {},
        },
        width: 1,
      });

      // Step 3: Set tags and publish (un-draft) the dashboard
      await axios.post(`api/dashboards/${dashboardId}`, {
        tags: [`report:${selectedCategory}`],
        is_draft: false,
        version: dashboardVersion,
      });

      const categoryObj = categories.find((c) => c.id === selectedCategory);
      const categoryName = categoryObj ? categoryObj.name : selectedCategory;

      notification.success(
        <span>
          Report published to <strong>{categoryName}</strong>.{" "}
          <a
            href={`reports/${selectedCategory}`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`reports/${selectedCategory}`);
            }}>
            View Reports
          </a>
        </span>
      );

      onClose(true);
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to publish report.";
      notification.error(message);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, query, visualization, categories, onClose]);

  return (
    <Modal
      title="Publish to Reports"
      visible={visible}
      onOk={handlePublish}
      onCancel={() => onClose(false)}
      okText="Publish"
      okButtonProps={{ loading, disabled: !selectedCategory || loading }}
      cancelButtonProps={{ disabled: loading }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, color: "#475569" }}>
          This will create a report dashboard with your <strong>{visualization?.name}</strong>{" "}
          visualization and publish it to the Reports page under the selected category.
        </p>
      </div>
      <div>
        <label
          htmlFor="publish-report-category"
          style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
          Report Category
        </label>
        <Select
          id="publish-report-category"
          style={{ width: "100%" }}
          placeholder={categoriesLoading ? "Loading categories..." : "Select a category"}
          value={selectedCategory || undefined}
          onChange={setSelectedCategory}
          loading={categoriesLoading}
          disabled={categoriesLoading}>
          {categories.map((cat) => (
            <Select.Option key={cat.id} value={cat.id}>
              <span style={{ marginRight: 6, color: cat.color || "#6b7280" }}>&#9679;</span>
              {cat.name}
            </Select.Option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}

PublishReportModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  visualization: PropTypes.object,
  query: PropTypes.object,
};

PublishReportModal.defaultProps = {
  visualization: null,
  query: null,
};

export default function PublishReportButton({ visualization, query }) {
  const [modalVisible, setModalVisible] = useState(false);

  // Only show for saved REPORT-type visualizations on saved queries
  if (!visualization || visualization.type !== "REPORT" || !visualization.id || !query || !query.id) {
    return null;
  }

  return (
    <>
      <Button
        className="publish-report-button"
        data-test="PublishToReports"
        type="link"
        onClick={() => setModalVisible(true)}>
        <i className="fa fa-share-square-o" aria-hidden="true" />
        <span className="m-l-5 hidden-xs">Publish to Reports</span>
      </Button>
      <PublishReportModal
        visible={modalVisible}
        onClose={(published) => {
          setModalVisible(false);
        }}
        visualization={visualization}
        query={query}
      />
    </>
  );
}

PublishReportButton.propTypes = {
  visualization: PropTypes.object,
  query: PropTypes.object,
};

PublishReportButton.defaultProps = {
  visualization: null,
  query: null,
};
