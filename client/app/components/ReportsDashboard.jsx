import React, { useState, useEffect, useMemo } from "react";
import Tabs from "antd/lib/tabs";
import Spin from "antd/lib/spin";
import Collapse from "antd/lib/collapse";
import {
  ShoppingCartOutlined,
  DollarOutlined,
  DatabaseOutlined,
  ShoppingOutlined,
  BookOutlined,
  FolderOutlined,
  LineChartOutlined,
  PieChartOutlined,
  BarChartOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  BankOutlined,
  CalendarOutlined,
  FundOutlined,
} from "@ant-design/icons";

import Link from "@/components/Link";
import { axios } from "@/services/axios";
import { buildCategoryTree, assignReports, subtreeReports } from "@/lib/reportCategoryTree";

import "./ReportsDashboard.less";

const { TabPane } = Tabs;

const ICON_MAP = {
  "shopping-cart": ShoppingCartOutlined,
  dollar: DollarOutlined,
  database: DatabaseOutlined,
  shopping: ShoppingOutlined,
  book: BookOutlined,
  folder: FolderOutlined,
  "line-chart": LineChartOutlined,
  "pie-chart": PieChartOutlined,
  "bar-chart": BarChartOutlined,
  "file-text": FileTextOutlined,
  team: TeamOutlined,
  setting: SettingOutlined,
  bank: BankOutlined,
  calendar: CalendarOutlined,
  fund: FundOutlined,
};

function CategoryIcon({ icon, color, size = 16 }) {
  const IconComponent = ICON_MAP[icon] || FolderOutlined;
  return <IconComponent style={{ fontSize: size, color: color || "#6b7280" }} />;
}

function DashboardButton({ dashboard }) {
  return (
    <Link className="report-button" href={dashboard.url || `dashboard/${dashboard.slug}`}>
      <i className="fa fa-tachometer report-button-icon" aria-hidden="true" />
      <span className="report-button-name">{dashboard.name}</span>
    </Link>
  );
}

function EmptyCategory() {
  return (
    <div className="reports-empty-state">
      <i className="fa fa-folder-open-o reports-empty-icon" aria-hidden="true" />
      <p>No reports in this category yet</p>
    </div>
  );
}

function ReportsGrid({ reports }) {
  return (
    <div className="reports-grid">
      {reports.map((dash) => (
        <DashboardButton key={dash.id} dashboard={dash} />
      ))}
    </div>
  );
}

// A folder's contents, SSRS order: its sub-folders first (collapsible, recursive), then its own reports.
function FolderContents({ node, byCategory, counts }) {
  const ownReports = byCategory[node.id] || [];
  const subFolders = node.children.filter((child) => counts[child.id] > 0);
  return (
    <>
      {subFolders.length > 0 && (
        <Collapse className="reports-subfolders" bordered={false}>
          {subFolders.map((child) => (
            <Collapse.Panel
              key={child.id}
              header={
                <span className="reports-tab-label">
                  <CategoryIcon icon={child.category.icon} color={child.category.color} size={14} />
                  <span className="reports-tab-name">{child.category.name}</span>
                  <span className="reports-folder-count">({counts[child.id]})</span>
                </span>
              }>
              <FolderContents node={child} byCategory={byCategory} counts={counts} />
            </Collapse.Panel>
          ))}
        </Collapse>
      )}
      {ownReports.length > 0 && <ReportsGrid reports={ownReports} />}
    </>
  );
}

export default function ReportsDashboard() {
  const [categories, setCategories] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        // Fetch categories
        const catResponse = await axios.get("api/jrny/report-categories");
        const cats = catResponse.categories || [];

        if (cancelled) return;

        // Fetch all dashboards and filter client-side by report:<category-id> tags
        const dashResponse = await axios.get("api/dashboards", {
          params: { page_size: 250 },
        });
        const allDashboards = (dashResponse.results || []).filter((dash) => {
          const tags = dash.tags || [];
          return tags.some((tag) => typeof tag === "string" && tag.startsWith("report:"));
        });

        if (cancelled) return;

        setCategories(cats);
        setDashboards(allDashboards);
      } catch (err) {
        // Silently handle errors - component just won't show data
        console.warn("Failed to load reports dashboard:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Folder tree; a dashboard belongs to its first report:<id> tag. Bare tags (e.g. "sales") still
  // count for top-level folders only, as before folders could nest.
  const { tree, byCategory, counts } = useMemo(() => {
    const builtTree = buildCategoryTree(categories);
    const assigned = assignReports(builtTree, dashboards, { bareTagTopLevel: true }).byCategory;
    const subtreeCounts = {};
    Object.keys(builtTree.byId).forEach((id) => {
      subtreeCounts[id] = subtreeReports(builtTree, assigned, id).length;
    });
    return { tree: builtTree, byCategory: assigned, counts: subtreeCounts };
  }, [categories, dashboards]);

  if (loading) {
    return (
      <div className="tile">
        <div className="t-body tb-padding reports-dashboard">
          <div className="d-flex align-items-center m-b-10">
            <p className="flex-fill f-500 c-black m-0">Reports</p>
          </div>
          <div className="reports-loading">
            <Spin size="default" />
          </div>
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="tile">
      <div className="t-body tb-padding reports-dashboard">
        <div className="d-flex align-items-center m-b-10">
          <p className="flex-fill f-500 c-black m-0">Reports</p>
          <Link href="reports" className="reports-view-all">
            View All
          </Link>
        </div>
        <Tabs defaultActiveKey={tree.roots[0]?.id} className="reports-tabs">
          {tree.roots.map((node) => (
            <TabPane
              key={node.id}
              tab={
                <span className="reports-tab-label">
                  <CategoryIcon icon={node.category.icon} color={node.category.color} />
                  <span className="reports-tab-name">{node.category.name}</span>
                  <span className="reports-folder-count">({counts[node.id]})</span>
                </span>
              }>
              <div className="reports-tab-content">
                {counts[node.id] > 0 ? (
                  <FolderContents node={node} byCategory={byCategory} counts={counts} />
                ) : (
                  <EmptyCategory />
                )}
              </div>
            </TabPane>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
