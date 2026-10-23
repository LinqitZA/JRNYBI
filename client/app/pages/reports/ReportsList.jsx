import React, { useState, useEffect, useCallback, useMemo } from "react";
import Input from "antd/lib/input";
import Spin from "antd/lib/spin";
import Empty from "antd/lib/empty";
import Tooltip from "antd/lib/tooltip";
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
import { sortBy, filter } from "lodash";
import moment from "moment";

import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import Link from "@/components/Link";
import PageHeader from "@/components/PageHeader";
import Layout from "@/components/layouts/ContentWithSidebar";
import { axios } from "@/services/axios";
import { Dashboard } from "@/services/dashboard";
import routes from "@/services/routes";
import notification from "@/services/notification";
import {
  getReportCategoryId,
  buildCategoryTree,
  assignReports,
  subtreeReports,
  ancestorIds,
} from "@/lib/reportCategoryTree";

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
 * Check if a dashboard is a report (has any report:* tag)
 */
function isReport(dashboard) {
  return getReportCategoryId(dashboard) !== null;
}

// Menu key for a folder's sub-menu (the folder's own menu item uses the plain category id)
function subMenuKey(categoryId) {
  return `folder:${categoryId}`;
}

function ReportCard({ report, onToggleFavorite }) {
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

  // Folder tree, each report in the folder of its first report:<id> tag, and counts that include
  // sub-folders. Reports whose category is unknown go to Uncategorized.
  const { tree, groupedReports, categoryCounts, recentReports } = useMemo(() => {
    const builtTree = buildCategoryTree(categories);
    const { byCategory, uncategorized } = assignReports(builtTree, dashboards);

    const grouped = { uncategorized: sortBy(uncategorized, "name") };
    Object.keys(byCategory).forEach((id) => {
      grouped[id] = sortBy(byCategory[id], "name");
    });

    const counts = { uncategorized: uncategorized.length };
    Object.keys(builtTree.byId).forEach((id) => {
      counts[id] = subtreeReports(builtTree, byCategory, id).length;
    });

    // Recent reports: top 5 most recently updated
    const recent = sortBy(dashboards, (d) => -new Date(d.updated_at || 0).getTime()).slice(0, 5);

    return { tree: builtTree, groupedReports: grouped, categoryCounts: counts, recentReports: recent };
  }, [dashboards, categories]);

  // Reports to show, as groups. A folder shows its own reports first, then one labelled group per
  // sub-folder (depth first, in folder order), so selecting a folder lists its whole subtree.
  const reportGroups = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase().trim();
    const matches = (list) => (lowerSearch ? filter(list, (d) => d.name.toLowerCase().includes(lowerSearch)) : list);

    if (currentCategory === "recent") {
      return [{ key: "recent", reports: matches(recentReports) }];
    }
    if (currentCategory === "all" || !currentCategory) {
      return [{ key: "all", reports: matches(sortBy(dashboards, "name")) }];
    }

    const node = tree.byId[currentCategory];
    if (!node) {
      return [{ key: currentCategory, reports: matches(groupedReports[currentCategory] || []) }];
    }

    const groups = [{ key: node.id, reports: matches(groupedReports[node.id] || []) }];
    const addChildren = (parent, path) => {
      parent.children.forEach((child) => {
        const childPath = [...path, child.category.name];
        groups.push({
          key: child.id,
          title: childPath.join(" / "),
          href: `reports/${child.id}`,
          reports: matches(groupedReports[child.id] || []),
        });
        addChildren(child, childPath);
      });
    };
    addChildren(node, []);
    return groups.filter((group) => group.reports.length > 0);
  }, [currentCategory, searchTerm, dashboards, tree, groupedReports, recentReports]);

  const visibleReportCount = reportGroups.reduce((total, group) => total + group.reports.length, 0);

  // Sub-menus to keep open: the path down to the selected folder (deep links open the right path),
  // plus any the user opened.
  const [openKeys, setOpenKeys] = useState([]);
  useEffect(() => {
    if (!tree.byId[currentCategory]) return;
    const pathKeys = [...ancestorIds(tree, currentCategory), currentCategory]
      .filter((id) => tree.byId[id].children.length > 0)
      .map(subMenuKey);
    setOpenKeys((prev) => Array.from(new Set([...prev, ...pathKeys])));
  }, [tree, currentCategory]);

  const renderCategoryLabel = (category, count, size = 14) => (
    <>
      <span className="btn-favorite m-r-5">
        <CategoryIcon icon={category.icon} color={category.color} size={size} />
      </span>
      {`${category.name} (${count})`}
    </>
  );

  // A folder without sub-folders is a link; a folder with sub-folders is a sub-menu whose first
  // entry ("All in <name>") selects the folder itself.
  const renderCategoryNode = (node) => {
    const count = categoryCounts[node.id] || 0;
    if (node.children.length === 0) {
      return (
        <AntdMenu.Item key={node.id} className="m-0">
          <Link href={`reports/${node.id}`}>{renderCategoryLabel(node.category, count)}</Link>
        </AntdMenu.Item>
      );
    }
    return (
      <AntdMenu.SubMenu key={subMenuKey(node.id)} className="m-0" title={renderCategoryLabel(node.category, count)}>
        <AntdMenu.Item key={node.id} className="m-0">
          <Link href={`reports/${node.id}`}>
            <span className="btn-favorite m-r-5">
              <FolderOutlined style={{ fontSize: 14, color: "#6b7280" }} />
            </span>
            {`All in ${node.category.name} (${count})`}
          </Link>
        </AntdMenu.Item>
        {node.children.map(renderCategoryNode)}
      </AntdMenu.SubMenu>
    );
  };

  // Fixed menu items above and below the folder tree
  const topItems = [
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
  // Uncategorized is shown only if it has items
  const bottomItems =
    categoryCounts["uncategorized"] > 0
      ? [
          {
            key: "uncategorized",
            href: "reports/uncategorized",
            title: `Uncategorized (${categoryCounts["uncategorized"]})`,
            icon: () => (
              <span className="btn-favorite m-r-5">
                <FolderOutlined style={{ fontSize: 14, color: "#6b7280" }} />
              </span>
            ),
          },
        ]
      : [];
  const renderFixedItem = (item) => (
    <AntdMenu.Item key={item.key} className="m-0">
      <Link href={item.href}>
        {item.icon && item.icon()}
        {item.title}
      </Link>
    </AntdMenu.Item>
  );

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
    const node = tree.byId[currentCategory];
    if (!node) return { name: currentCategory, description: "", ancestors: [] };
    const cat = node.category;
    const ancestors = ancestorIds(tree, currentCategory).map((id) => tree.byId[id].category);
    return { name: cat.name, description: cat.description, icon: cat.icon, color: cat.color, ancestors };
  }, [currentCategory, tree]);

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
                selectedKeys={[effectiveCategory]}
                openKeys={openKeys}
                onOpenChange={setOpenKeys}>
                {topItems.map(renderFixedItem)}
                {tree.roots.map(renderCategoryNode)}
                {bottomItems.map(renderFixedItem)}
              </AntdMenu>
            </div>
          </Layout.Sidebar>
          <Layout.Content>
            {currentCategoryInfo.ancestors && currentCategoryInfo.ancestors.length > 0 && (
              <div className="reports-breadcrumbs" data-test="ReportsBreadcrumbs">
                {currentCategoryInfo.ancestors.map((ancestor) => (
                  <React.Fragment key={ancestor.id}>
                    <Link href={`reports/${ancestor.id}`}>{ancestor.name}</Link>
                    <span className="reports-breadcrumbs-separator">/</span>
                  </React.Fragment>
                ))}
                <span>{currentCategoryInfo.name}</span>
              </div>
            )}
            {loading ? (
              <div className="reports-loading">
                <Spin size="large" />
              </div>
            ) : visibleReportCount === 0 ? (
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
              reportGroups.map((group) => (
                <div key={group.key} className="reports-group">
                  {group.title && (
                    <h5 className="reports-group-title" data-test={`ReportsGroup-${group.key}`}>
                      <FolderOutlined className="m-r-5" />
                      <Link href={group.href}>{group.title}</Link>
                    </h5>
                  )}
                  <div className="reports-grid" data-test="ReportsGrid">
                    {group.reports.map((report) => (
                      <ReportCard key={report.id} report={report} onToggleFavorite={handleToggleFavorite} />
                    ))}
                  </div>
                </div>
              ))
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
