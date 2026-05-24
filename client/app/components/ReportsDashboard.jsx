import React, { useState, useEffect } from "react";
import Tabs from "antd/lib/tabs";
import Spin from "antd/lib/spin";
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

export default function ReportsDashboard() {
  const [categories, setCategories] = useState([]);
  const [dashboards, setDashboards] = useState({});
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

        // Group dashboards by category
        const grouped = {};
        cats.forEach((cat) => {
          grouped[cat.id] = [];
        });

        allDashboards.forEach((dash) => {
          const tags = dash.tags || [];
          cats.forEach((cat) => {
            if (tags.includes(cat.id) || tags.includes(`report:${cat.id}`)) {
              if (!grouped[cat.id]) {
                grouped[cat.id] = [];
              }
              grouped[cat.id].push(dash);
            }
          });
        });

        setCategories(cats);
        setDashboards(grouped);
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
        <Tabs defaultActiveKey={categories[0]?.id} className="reports-tabs">
          {categories.map((cat) => (
            <TabPane
              key={cat.id}
              tab={
                <span className="reports-tab-label">
                  <CategoryIcon icon={cat.icon} color={cat.color} />
                  <span className="reports-tab-name">{cat.name}</span>
                </span>
              }>
              <div className="reports-tab-content">
                {(dashboards[cat.id] || []).length > 0 ? (
                  <div className="reports-grid">
                    {dashboards[cat.id].map((dash) => (
                      <DashboardButton key={dash.id} dashboard={dash} />
                    ))}
                  </div>
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
