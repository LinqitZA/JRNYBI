import { find, isArray, get, first, map, intersection, isEqual, isEmpty, debounce } from "lodash";
import React from "react";
import PropTypes from "prop-types";
import SelectWithVirtualScroll from "@/components/SelectWithVirtualScroll";

const DEBOUNCE_SEARCH_MS = 200;

export default class QueryBasedParameterInput extends React.Component {
  static propTypes = {
    parameter: PropTypes.any, // eslint-disable-line react/forbid-prop-types
    value: PropTypes.any, // eslint-disable-line react/forbid-prop-types
    mode: PropTypes.oneOf(["default", "multiple"]),
    queryId: PropTypes.number,
    onSelect: PropTypes.func,
    className: PropTypes.string,
  };

  static defaultProps = {
    value: null,
    mode: "default",
    parameter: null,
    queryId: null,
    onSelect: () => {},
    className: "",
  };

  constructor(props) {
    super(props);
    this.state = {
      options: [],
      filteredOptions: null,
      value: null,
      loading: false,
    };
    this.debouncedFilter = debounce(this._filterOptions, DEBOUNCE_SEARCH_MS);
  }

  componentWillUnmount() {
    this.debouncedFilter.cancel();
  }

  _filterOptions = (searchText) => {
    if (!searchText) {
      this.setState({ filteredOptions: null });
      return;
    }
    const lowerSearch = searchText.toLowerCase();
    const filtered = this.state.options.filter(
      (opt) => String(opt.name).toLowerCase().includes(lowerSearch) || String(opt.value).toLowerCase().includes(lowerSearch)
    );
    this.setState({ filteredOptions: filtered });
  };

  handleSearch = (searchText) => {
    if (this.state.options.length > 500) {
      this.debouncedFilter(searchText);
    } else {
      this.setState({ filteredOptions: null });
    }
  };

  componentDidMount() {
    this._loadOptions(this.props.queryId);
  }

  componentDidUpdate(prevProps) {
    if (this.props.queryId !== prevProps.queryId) {
      this._loadOptions(this.props.queryId);
    }
    if (this.props.value !== prevProps.value) {
      this.setValue(this.props.value);
    }
    // Cascading: reload options when parent parameter value changes
    if (this.props.cascadeKey !== prevProps.cascadeKey) {
      this._loadOptions(this.props.queryId, true);
    }
  }

  setValue(value) {
    const { options } = this.state;
    if (this.props.mode === "multiple") {
      value = isArray(value) ? value : [value];
      const optionValues = map(options, option => option.value);
      const validValues = intersection(value, optionValues);
      this.setState({ value: validValues });
      return validValues;
    }
    const found = find(options, option => option.value === this.props.value) !== undefined;
    value = found ? value : get(first(options), "value");
    this.setState({ value });
    return value;
  }

  async _loadOptions(queryId, forceReload = false) {
    if (queryId && (queryId !== this.state.queryId || forceReload)) {
      this.setState({ loading: true });
      const options = await this.props.parameter.loadDropdownValues();

      // stale queryId check
      if (this.props.queryId === queryId) {
        this.setState({ options, loading: false }, () => {
          const updatedValue = this.setValue(this.props.value);
          if (!isEqual(updatedValue, this.props.value)) {
            this.props.onSelect(updatedValue);
          }
        });
      }
    }
  }

  render() {
    const { className, mode, onSelect, queryId, value, ...otherProps } = this.props;
    const { loading, options, filteredOptions } = this.state;
    const displayOptions = filteredOptions || options;
    return (
      <span>
        <SelectWithVirtualScroll
          className={className}
          disabled={loading}
          loading={loading}
          mode={mode}
          value={this.state.value}
          onChange={onSelect}
          options={map(displayOptions, ({ value, name }) => ({ label: String(name), value }))}
          showSearch
          showArrow
          onSearch={this.handleSearch}
          notFoundContent={isEmpty(options) ? "No options available" : null}
          {...otherProps}
        />
      </span>
    );
  }
}
