import React, { useMemo, useState, useEffect } from "react";
import { first, includes } from "lodash";
import Menu from "antd/lib/menu";
import Link from "@/components/Link";
import PlainButton from "@/components/PlainButton";
import HelpTrigger from "@/components/HelpTrigger";
import CreateDashboardDialog from "@/components/dashboards/CreateDashboardDialog";
import { useCurrentRoute } from "@/components/ApplicationArea/Router";
import { Auth, currentUser, clientConfig } from "@/services/auth";
import settingsMenu from "@/services/settingsMenu";
import theme from "@/services/theme";
import logoUrl from "@/assets/images/jrnybi_logo.svg";

import DesktopOutlinedIcon from "@ant-design/icons/DesktopOutlined";
import CodeOutlinedIcon from "@ant-design/icons/CodeOutlined";
import AlertOutlinedIcon from "@ant-design/icons/AlertOutlined";
import FileTextOutlinedIcon from "@ant-design/icons/FileTextOutlined";
import PlusOutlinedIcon from "@ant-design/icons/PlusOutlined";
import QuestionCircleOutlinedIcon from "@ant-design/icons/QuestionCircleOutlined";
import SettingOutlinedIcon from "@ant-design/icons/SettingOutlined";
import BookOutlinedIcon from "@ant-design/icons/BookOutlined";
import ArrowLeftOutlinedIcon from "@ant-design/icons/ArrowLeftOutlined";
import UserOutlinedIcon from "@ant-design/icons/UserOutlined";
import BulbOutlinedIcon from "@ant-design/icons/BulbOutlined";
import VersionInfo from "./VersionInfo";

function ThemeMenuItem({ mode, label, currentMode, onSelect }) {
  const selected = currentMode === mode;
  return (
    <PlainButton
      data-test={`ThemeMode-${mode}`}
      className={`theme-mode-item ${selected ? "theme-mode-item-active" : ""}`}
      onClick={() => onSelect(mode)}>
      {selected ? "● " : "○ "}
      {label}
    </PlainButton>
  );
}

function getUserInitials(name) {
  if (!name || typeof name !== "string") return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

import "./DesktopNavbar.less";

function useNavbarActiveState() {
  const currentRoute = useCurrentRoute();

  return useMemo(
    () => ({
      dashboards: includes(
        [
          "Dashboards.List",
          "Dashboards.Favorites",
          "Dashboards.My",
          "Dashboards.ViewOrEdit",
          "Dashboards.LegacyViewOrEdit",
        ],
        currentRoute.id
      ),
      queries: includes(
        [
          "Queries.List",
          "Queries.Favorites",
          "Queries.Archived",
          "Queries.My",
          "Queries.View",
          "Queries.New",
          "Queries.Edit",
        ],
        currentRoute.id
      ),
      dataSources: includes(["DataSources.List"], currentRoute.id),
      alerts: includes(["Alerts.List", "Alerts.New", "Alerts.View", "Alerts.Edit"], currentRoute.id),
      reports: includes(["Reports.List", "Reports.Category"], currentRoute.id),
      dataDictionary: includes(["JRNY.DataDictionary"], currentRoute.id),
    }),
    [currentRoute.id]
  );
}

export default function DesktopNavbar() {
  const firstSettingsTab = first(settingsMenu.getAvailableItems());

  const activeState = useNavbarActiveState();

  const [themeMode, setThemeMode] = useState(theme.mode);
  useEffect(() => {
    // re-render when a theme change is broadcast (e.g. OS preference flips)
    const unsubscribe = theme.subscribe(() => setThemeMode(theme.mode));
    return unsubscribe;
  }, []);
  const handleThemeChange = newMode => {
    theme.setMode(newMode);
    setThemeMode(newMode);
  };

  const canCreateQuery = currentUser.hasPermission("create_query");
  const canCreateDashboard = currentUser.hasPermission("create_dashboard");
  const canCreateAlert = currentUser.hasPermission("list_alerts");

  return (
    <nav className="desktop-navbar">
      <div className="desktop-navbar-left">
        <Link href="./" className="desktop-navbar-logo">
          <img src={logoUrl} alt="JRNYBI" />
          <span className="desktop-navbar-brand">JRNYBI</span>
        </Link>

        <Menu selectable={false} mode="horizontal" theme="dark" className="desktop-navbar-main-menu">
          {currentUser.hasPermission("list_dashboards") && (
            <Menu.Item key="dashboards" className={activeState.dashboards ? "navbar-active-item" : null}>
              <Link href="dashboards">
                <DesktopOutlinedIcon aria-label="Dashboard navigation button" />
                <span className="desktop-navbar-label">Dashboards</span>
              </Link>
            </Menu.Item>
          )}
          {currentUser.hasPermission("list_dashboards") && (
            <Menu.Item key="reports" className={activeState.reports ? "navbar-active-item" : null}>
              <Link href="reports">
                <FileTextOutlinedIcon aria-label="Reports navigation button" />
                <span className="desktop-navbar-label">Reports</span>
              </Link>
            </Menu.Item>
          )}
          {currentUser.hasPermission("view_query") && (
            <Menu.Item key="queries" className={activeState.queries ? "navbar-active-item" : null}>
              <Link href="queries">
                <CodeOutlinedIcon aria-label="Queries navigation button" />
                <span className="desktop-navbar-label">Queries</span>
              </Link>
            </Menu.Item>
          )}
          {currentUser.hasPermission("list_alerts") && (
            <Menu.Item key="alerts" className={activeState.alerts ? "navbar-active-item" : null}>
              <Link href="alerts">
                <AlertOutlinedIcon aria-label="Alerts navigation button" />
                <span className="desktop-navbar-label">Alerts</span>
              </Link>
            </Menu.Item>
          )}
          <Menu.Item key="data-dictionary" className={activeState.dataDictionary ? "navbar-active-item" : null}>
            <Link href="jrny/data-dictionary">
              <BookOutlinedIcon aria-label="Data Dictionary navigation button" />
              <span className="desktop-navbar-label">Data Dictionary</span>
            </Link>
          </Menu.Item>
        </Menu>
      </div>

      <div className="desktop-navbar-right">
        <Menu selectable={false} mode="horizontal" theme="dark" className="desktop-navbar-actions-menu">
          {(canCreateQuery || canCreateDashboard || canCreateAlert) && (
            <Menu.SubMenu
              key="create"
              popupClassName="desktop-navbar-submenu"
              data-test="CreateButton"
              tabIndex={0}
              title={
                <React.Fragment>
                  <PlusOutlinedIcon />
                  <span className="desktop-navbar-label">Create</span>
                </React.Fragment>
              }>
              {canCreateQuery && (
                <Menu.Item key="new-query">
                  <Link href="queries/new" data-test="CreateQueryMenuItem">
                    New Query
                  </Link>
                </Menu.Item>
              )}
              {canCreateDashboard && (
                <Menu.Item key="new-dashboard">
                  <PlainButton data-test="CreateDashboardMenuItem" onClick={() => CreateDashboardDialog.showModal()}>
                    New Dashboard
                  </PlainButton>
                </Menu.Item>
              )}
              {canCreateAlert && (
                <Menu.Item key="new-alert">
                  <Link data-test="CreateAlertMenuItem" href="alerts/new">
                    New Alert
                  </Link>
                </Menu.Item>
              )}
            </Menu.SubMenu>
          )}

          <Menu.Item key="help">
            <HelpTrigger showTooltip={false} type="HOME" tabIndex={0}>
              <QuestionCircleOutlinedIcon />
              <span className="desktop-navbar-label">Help</span>
            </HelpTrigger>
          </Menu.Item>

          {firstSettingsTab && currentUser.hasPermission("admin") && (
            <Menu.Item key="settings" className={activeState.dataSources ? "navbar-active-item" : null}>
              <Link href={firstSettingsTab.path} data-test="SettingsLink">
                <SettingOutlinedIcon />
                <span className="desktop-navbar-label">Settings</span>
              </Link>
            </Menu.Item>
          )}
        </Menu>

        <Menu selectable={false} mode="horizontal" theme="dark" className="desktop-navbar-profile-menu">
          <Menu.SubMenu
            key="profile"
            popupClassName="desktop-navbar-submenu"
            tabIndex={0}
            title={
              <span data-test="ProfileDropdown" className="desktop-navbar-profile-menu-title">
                <span className="profile-avatar" aria-label={currentUser.name}>
                  {getUserInitials(currentUser.name) || <UserOutlinedIcon />}
                </span>
              </span>
            }>
            <Menu.Item key="profile">
              <Link href="users/me">Profile</Link>
            </Menu.Item>
            {currentUser.hasPermission("super_admin") && (
              <Menu.Item key="status">
                <Link href="admin/status">System Status</Link>
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.SubMenu
              key="theme"
              popupClassName="desktop-navbar-submenu"
              title={
                <span data-test="ThemeMenu">
                  <BulbOutlinedIcon /> Theme
                </span>
              }>
              <Menu.Item key="theme-light">
                <ThemeMenuItem mode="light" label="Light" currentMode={themeMode} onSelect={handleThemeChange} />
              </Menu.Item>
              <Menu.Item key="theme-dark">
                <ThemeMenuItem mode="dark" label="Dark" currentMode={themeMode} onSelect={handleThemeChange} />
              </Menu.Item>
              <Menu.Item key="theme-system">
                <ThemeMenuItem mode="system" label="System" currentMode={themeMode} onSelect={handleThemeChange} />
              </Menu.Item>
            </Menu.SubMenu>
            <Menu.Divider />
            <Menu.Item key="logout">
              <PlainButton data-test="LogOutButton" onClick={() => Auth.logout()}>
                Log out
              </PlainButton>
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item key="version" role="presentation" disabled className="version-info">
              <VersionInfo />
            </Menu.Item>
          </Menu.SubMenu>
        </Menu>

        {clientConfig.jrnyErpUrl && clientConfig.jrnyErpUrl !== "/" && (
          <PlainButton
            className="back-to-jrny-btn"
            data-test="BackToJRNY"
            onClick={() => {
              try {
                window.parent.location.href = clientConfig.jrnyErpUrl;
              } catch (e) {
                // Fallback if cross-origin restriction prevents parent access
                window.location.href = clientConfig.jrnyErpUrl;
              }
            }}>
            <ArrowLeftOutlinedIcon />
            <span className="desktop-navbar-label">Back to JRNY</span>
          </PlainButton>
        )}
      </div>
    </nav>
  );
}
