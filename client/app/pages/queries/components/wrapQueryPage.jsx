import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { extend } from "lodash";
import LoadingState from "@/components/items-list/components/LoadingState";
import { Query } from "@/services/query";
import useImmutableCallback from "@/lib/hooks/useImmutableCallback";
import location from "@/services/location";

export default function wrapQueryPage(WrappedComponent) {
  function QueryPageWrapper({ queryId, onError, ...props }) {
    const [query, setQuery] = useState(null);

    const handleError = useImmutableCallback(onError);

    useEffect(() => {
      let isCancelled = false;
      let promise;
      if (queryId) {
        promise = Query.get({ id: queryId });
      } else {
        const newQuery = Query.newQuery();
        // Pre-fill query text from URL param (e.g., from Data Dictionary "New Query" link)
        const queryParam = location.search.query;
        if (queryParam) {
          extend(newQuery, { query: queryParam });
        }
        promise = Promise.resolve(newQuery);
      }
      promise
        .then(result => {
          if (!isCancelled) {
            setQuery(result);
          }
        })
        .catch(handleError);

      return () => {
        isCancelled = true;
      };
    }, [queryId, handleError]);

    if (!query) {
      return <LoadingState className="flex-fill" />;
    }

    return <WrappedComponent query={query} onError={onError} {...props} />;
  }

  QueryPageWrapper.propTypes = {
    queryId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  };

  QueryPageWrapper.defaultProps = {
    queryId: null,
  };

  return QueryPageWrapper;
}
