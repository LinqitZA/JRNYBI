import React, { useState, useEffect, useCallback, useMemo } from "react";
import Input from "antd/lib/input";
import Spin from "antd/lib/spin";
import Empty from "antd/lib/empty";
import Tooltip from "antd/lib/tooltip";
import Button from "antd/lib/button";
import AntdMenu from "antd/lib/menu";
import {
  StarOutlined,
  StarFilled,
  ClockCircleOutlined,
  FolderOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  DatabaseOutlined,
  ShoppingOutlined,
  BookOutlined,
  LineChartOutlined,
  PieChartOutlined,
  BarChartOutlined,
  FileTextOutlined,
  TeamOutlined,
  SettingOutlined,
  BankOutlined,
  CalendarOutlined,
  FundOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { sortBy, filter, some } from "lodash";
import moment from "moment";

import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import Link from "@/components/Link";
import PageHeader from "@/components/PageHeader";
import Layout from "@/components/layouts/ContentWithSidebar";
import { axios } from "@/services/axios";
import { Dashboard } from "@/services/dashboard";
import { currentUser } from "@/services/auth";
import routes from "@/services/routes";
import notification from "@/services/notification";

import "./reports-list.less";

// Same icon map as ReportCategories admin page
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

/**
 * Extracts report category id from a dashboard's tags.
 * Convention: tag format is "report:<category-id>"
 * Returns the first report category id found, or null.
 */
function getReportCategory(dashboard) {
  if (!dashboard.tags || !Array.isArray(dashboard.tags)) return null;
  for (const tag of dashboard.tags) {
    if (typeof tag === "string" && tag.startsWith("report:")) {
      return tag.substring(7); // remove "report:" prefix
    }
  }
  return null;
}

/**
 * Check if a dashboard is a report (has any report:* tag)
 */
function isReport(dashboard) {
  return getReportCategory(dashboard) !== null;
}

function ReportCard({ report, onToggleFavorite }) {
  const categoryId = getReportCategory(report);
  const updatedAt = report.updated_at ? moment(report.updated_at).fromNow() : "Unknown";
  const createdBy = report.user ? report.user.name : "Unknown";

  return (
    <div className="report-card" data-test={`ReportCard-${report.id}`}>
      <div className="report-card-header">
        <div className="report-card-title-row">
          <Link href={report.url || `dashboards/${report.id}-${report.slug}`} className="report-card-title">
            {report.name}
          </Link>
          <Tooltip title={report.is_favorite ? "Remove from favorites" : "Add to favorites"}>
            <button
              type="button"
              className={`report-card-star ${report.is_favorite ? "favorited" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onToggleFavorite(report);
              }}>
              {report.is_favorite ? <StarFilled /> : <StarOutlined />}
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="report-card-meta">
        <span className="report-card-meta-item">
          <ClockCircleOutlined /> {updatedAt}
        </span>
        <span className="report-card-meta-item">by {createdBy}</span>
      </div>
      <div className="report-card-footer">
        <Link href={report.url || `dashboards/${report.id}-${report.slug}`} className="report-card-view-btn">
          View Report <RightOutlined />
        </Link>
      </div>
    </div>
  );
}

function ReportsList({ currentCategory }) {
  const [categories, setCategories] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, dashRes] = await Promise.all([
        axios.get("api/jrny/report-categories"),
        Dashboard.query({ page_size: 250 }),
      ]);
      setCategories(catRes.categories || []);
      // Filter to only report-tagged dashboards
      const reportDashboards = filter(dashRes.results || [], isReport);
      setDashboards(reportDashboards);
    } catch (err) {
      notification.error("Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleFavorite = useCallback(
    async (report) => {
      try {
        if (report.is_favorite) {
          await Dashboard.unfavorite(report);
        } else {
          await Dashboard.favorite(report);
        }
        // Update local state
        setDashboards((prev) =>
          prev.map((d) => (d.id === report.id ? { ...d, is_favorite: !d.is_favorite } : d))
        );
      } catch (err) {
        notification.error("Failed to update favorite.");
      }
    },
    []
  );

  // Build category counts and grouped data
  const { groupedReports, categoryCounts, recentReports } = useMemo(() => {
    const grouped = {};
    const counts = {};

    // Initialize all known categories
    categories.forEach((cat) => {
      grouped[cat.id] = [];
      counts[cat.id] = 0;
    });
    grouped["uncategorized"] = [];
    counts["uncategorized"] = 0;

    // Group dashboards by category
    dashboards.forEach((d) => {
      const catId = getReportCategory(d);
      const bucket = catId && grouped[catId] !== undefined ? catId : "uncategorized";
      grouped[bucket].push(d);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });

    // Sort each group by name
    Object.keys(grouped).forEach((key) => {
      grouped[key] = sortBy(grouped[key], "name");
    });

    // Recent reports: top 5 most recently updated
    const recent = sortBy(dashboards, (d) => -(new Date(d.updated_at || 0).getTime())).slice(0, 5);

    return { groupedReports: grouped, categoryCounts: counts, recentReports: recent };
  }, [dashboards, categories]);

  // Filter by search term
  const filteredReports = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();

    if (currentCategory === "recent") {
      if (!lowerSearch) return recentReports;
      return filter(recentReports, (d) => d.name.toLowerCase().includes(lowerSearch));
    }

    if (currentCategory === "all" || !currentCategory) {
      if (!lowerSearch) return sortBy(dashboards, "name");
      return filter(sortBy(dashboards, "name"), (d) => d.name.toLowerCase().includes(lowerSearch));
    }

    const catReports = groupedReports[currentCategory] || [];
    if (!lowerSearch) return catReports;
    return filter(catReports, (d) => d.name.toLowerCase().includes(lowerSearch));
  }, [currentCategory, searchTerm, dashboards, groupedReports, recentReports]);

  // Build sidebar menu items
  const sidebarItems = useMemo(() => {
    const items = [
      {
        key: "all",
        href: "reports",
        title: `All Reports`,
        icon: () => (
          <span className="btn-favorite m-r-5">
            <FileTextOutlined style={{ fontSize: 14 }} />
          </span>
        ),
      },
      {
        key: "recent",
        href: "reports/recent",
        title: "Recently Updated",
        icon: () => (
          <span className="btn-favorite m-r-5">
            <ClockCircleOutlined style={{ fontSize: 14 }} />
          </span>
        ),
      },
    ];

    categories.forEach((cat) => {
      const count = categoryCounts[cat.id] || 0;
      items.push({
        key: cat.id,
        href: `reports/${cat.id}`,
        title: `${cat.name} (${count})`,
        icon: () => (
          <span className="btn-favorite m-r-5">
            <CategoryIcon icon={cat.icon} color={cat.color} size={14} />
          </span>
        ),
      });
    });

    // Add uncategorized if it has items
    if (categoryCounts["uncategorized"] > 0) {
      items.push({
        key: "uncategorized",
        href: "reports/uncategorized",
        title: `Uncategorized (${categoryCounts["uncategorized"]})`,
        icon: () => (
          <span className="btn-favorite m-r-5">
            <FolderOutlined style={{ fontSize: 14, color: "#6b7280" }} />
          </span>
        ),
      });
    }

    return items;
  }, [categories, categoryCounts]);

  // Current category info for the header
  const currentCategoryInfo = useMemo(() => {
    if (currentCategory === "all" || !currentCategory) {
      return { name: "All Reports", description: "View all reports across categories" };
    }
    if (currentCategory === "recent") {
      return { name: "Recently Updated", description: "Reports updated most recently" };
    }
    if (currentCategory === "uncategorized") {
      return { name: "Uncategorized", description: "Reports without a category assignment" };
    }
    const cat = categories.find((c) => c.id === currentCategory);
    return cat
      ? { name: cat.name, description: cat.description, icon: cat.icon, color: cat.color }
      : { name: currentCategory, description: "" };
  }, [currentCategory, categories]);

  const effectiveCategory = currentCategory || "all";

  return (
    <div className="page-reports-list">
      <div className="container">
        <PageHeader title={currentCategoryInfo.name} />
        <Layout>
          <Layout.Sidebar className="m-b-0">
            <div className="m-b-10">
              <Input
                className="form-control"
                placeholder="Search Reports..."
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search reports"
                allowClear
              />
            </div>
            <div className="m-b-10 tags-list tiled">
              <AntdMenu
                className="invert-stripe-position"
                mode="inline"
                selectable={false}
                selectedKeys={[effectiveCategory]}>
                {sidebarItems.map((item) => (
                  <AntdMenu.Item key={item.key} className="m-0">
                    <Link href={item.href}>
                      {item.icon && item.icon()}
                      {item.title}
                    </Link>
                  </AntdMenu.Item>
                ))}
              </AntdMenu>
            </div>
          </Layout.Sidebar>
          <Layout.Content>
            {loading ? (
              <div className="reports-loading">
                <Spin size="large" />
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="reports-empty">
                <Empty
                  description={
                    searchTerm
                      ? "No reports match your search."
                      : "No reports in this category yet."
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
                {!searchTerm && currentCategory === "all" && (
                  <p className="reports-empty-hint">
                    Tag any dashboard with <code>report:category-id</code> to make it appear here.
                  </p>
                )}
              </div>
            ) : (
              <div className="reports-grid" data-test="ReportsGrid">
                {filteredReports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            )}
          </Layout.Content>
        </Layout>
      </div>
    </div>
  );
}

// Route registrations
routes.register(
  "Reports.List",
  routeWithUserSession({
    path: "/reports",
    title: "Reports",
    render: (pageProps) => <ReportsList {...pageProps} currentCategory="all" />,
  })
);

routes.register(
  "Reports.Category",
  routeWithUserSession({
    path: "/reports/:category",
    title: "Reports",
    render: (pageProps) => <ReportsList {...pageProps} currentCategory={pageProps.category} />,
  })
);

export default ReportsList;
