import React from "react";
import PropTypes from "prop-types";
import Dropdown from "antd/lib/dropdown";
import Menu from "antd/lib/menu";
import Button from "antd/lib/button";
import PlainButton from "@/components/PlainButton";
import { clientConfig } from "@/services/auth";
import { canExportAsShown, buildExportTitle, resolveSelectedVisualization } from "@/lib/excelAsShown";
import { exportVisualizationAsShown } from "@/services/excelExport";

import PlusCircleFilledIcon from "@ant-design/icons/PlusCircleFilled";
import ShareAltOutlinedIcon from "@ant-design/icons/ShareAltOutlined";
import FileOutlinedIcon from "@ant-design/icons/FileOutlined";
import FileExcelOutlinedIcon from "@ant-design/icons/FileExcelOutlined";
import EllipsisOutlinedIcon from "@ant-design/icons/EllipsisOutlined";

import QueryResultsLink from "./QueryResultsLink";

export default function QueryControlDropdown(props) {
  // "Download as Excel (as shown)" exports the visualization shown in the selected tab.
  // Shown for pivot and table visualizations; disabled while running or when the result has no rows.
  const selectedVisualization = resolveSelectedVisualization(props.query.visualizations, props.selectedTab);
  const showDownloadAsShown =
    !!props.exportRef && canExportAsShown({ visualizationType: selectedVisualization.type, isQueryResultEmpty: false });
  const canDownloadAsShown = canExportAsShown({
    visualizationType: selectedVisualization.type,
    isQueryResultEmpty: props.queryExecuting || !props.queryResult.isEmpty || props.queryResult.isEmpty(),
  });
  const downloadAsShown = () =>
    exportVisualizationAsShown(props.exportRef, {
      title: buildExportTitle(props.query.name, selectedVisualization),
      parameters: props.query.getParametersDefs ? props.query.getParametersDefs(false) : [],
    });

  const menu = (
    <Menu>
      {!props.query.isNew() && (!props.query.is_draft || !props.query.is_archived) && (
        <Menu.Item>
          <PlainButton onClick={() => props.openAddToDashboardForm(props.selectedTab)}>
            <PlusCircleFilledIcon /> Add to Dashboard
          </PlainButton>
        </Menu.Item>
      )}
      {!clientConfig.disablePublicUrls && !props.query.isNew() && (
        <Menu.Item>
          <PlainButton
            onClick={() => props.showEmbedDialog(props.query, props.selectedTab)}
            data-test="ShowEmbedDialogButton">
            <ShareAltOutlinedIcon /> Embed Elsewhere
          </PlainButton>
        </Menu.Item>
      )}
      <Menu.Item>
        <QueryResultsLink
          fileType="csv"
          disabled={props.queryExecuting || !props.queryResult.getData || !props.queryResult.getData()}
          query={props.query}
          queryResult={props.queryResult}
          embed={props.embed}
          apiKey={props.apiKey}>
          <FileOutlinedIcon /> Download as CSV File
        </QueryResultsLink>
      </Menu.Item>
      <Menu.Item>
        <QueryResultsLink
          fileType="tsv"
          disabled={props.queryExecuting || !props.queryResult.getData || !props.queryResult.getData()}
          query={props.query}
          queryResult={props.queryResult}
          embed={props.embed}
          apiKey={props.apiKey}>
          <FileOutlinedIcon /> Download as TSV File
        </QueryResultsLink>
      </Menu.Item>
      <Menu.Item>
        <QueryResultsLink
          fileType="xlsx"
          disabled={props.queryExecuting || !props.queryResult.getData || !props.queryResult.getData()}
          query={props.query}
          queryResult={props.queryResult}
          embed={props.embed}
          apiKey={props.apiKey}>
          <FileExcelOutlinedIcon /> Download as Excel File
        </QueryResultsLink>
      </Menu.Item>
      {showDownloadAsShown && (
        <Menu.Item key="download_excel_as_shown" disabled={!canDownloadAsShown}>
          <PlainButton onClick={downloadAsShown} disabled={!canDownloadAsShown} data-test="DownloadExcelAsShownButton">
            <FileExcelOutlinedIcon /> Download as Excel (as shown)
          </PlainButton>
        </Menu.Item>
      )}
    </Menu>
  );

  return (
    <Dropdown trigger={["click"]} overlay={menu} overlayClassName="query-control-dropdown-overlay">
      <Button data-test="QueryControlDropdownButton">
        <EllipsisOutlinedIcon rotate={90} />
      </Button>
    </Dropdown>
  );
}

QueryControlDropdown.propTypes = {
  query: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  queryResult: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  queryExecuting: PropTypes.bool.isRequired,
  showEmbedDialog: PropTypes.func.isRequired,
  embed: PropTypes.bool,
  apiKey: PropTypes.string,
  selectedTab: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  openAddToDashboardForm: PropTypes.func.isRequired,
  // ref the selected visualization's Renderer sets to { getGrid } (pivot and table only)
  exportRef: PropTypes.shape({ current: PropTypes.any }), // eslint-disable-line react/forbid-prop-types
};

QueryControlDropdown.defaultProps = {
  queryResult: {},
  embed: false,
  apiKey: "",
  selectedTab: "",
  exportRef: null,
};
