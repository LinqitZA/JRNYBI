import React, { useRef, useCallback } from "react";
import PropTypes from "prop-types";
import DynamicComponent from "@/components/DynamicComponent";
import DesktopNavbar from "./DesktopNavbar";
import MobileNavbar from "./MobileNavbar";

import "./index.less";

export default function ApplicationLayout({ children }) {
  const mobileNavbarContainerRef = useRef();

  const getMobileNavbarPopupContainer = useCallback(() => mobileNavbarContainerRef.current, []);

  return (
    <React.Fragment>
      <DynamicComponent name="ApplicationWrapper">
        <div className="application-layout-desktop-navbar">
          <DynamicComponent name="ApplicationDesktopNavbar">
            <DesktopNavbar />
          </DynamicComponent>
        </div>
        <nav className="application-layout-mobile-navbar" ref={mobileNavbarContainerRef}>
          <DynamicComponent name="ApplicationMobileNavbar" getPopupContainer={getMobileNavbarPopupContainer}>
            <MobileNavbar getPopupContainer={getMobileNavbarPopupContainer} />
          </DynamicComponent>
        </nav>
        <div className="application-layout-content">
          {children}
        </div>
      </DynamicComponent>
    </React.Fragment>
  );
}

ApplicationLayout.propTypes = {
  children: PropTypes.node,
};

ApplicationLayout.defaultProps = {
  children: null,
};
