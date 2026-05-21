import React, { useState, useEffect } from "react";
import { Section, Select } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

interface ReportCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
}

export default function PublishSettings({ options, onOptionsChange }: any) {
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("api/jrny/report-categories", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json();
      })
      .then((data) => {
        setCategories(data.categories || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load categories");
        setLoading(false);
      });
  }, []);

  return (
    <React.Fragment>
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        {/* @ts-expect-error ts-migrate(2746) FIXME */}
        <Section.Title>Publish to Reports</Section.Title>
        <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 12px" }}>
          Select a report category to enable one-click publishing from the query page.
          After saving this visualization, use the &quot;Publish to Reports&quot; button
          on the query page to create a report dashboard automatically.
        </p>
      </Section>

      {error && (
        <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          layout="horizontal"
          label="Report Category"
          value={options.reportCategory || undefined}
          onChange={(value: any) => onOptionsChange({ reportCategory: value || "" })}
          placeholder={loading ? "Loading categories..." : "Select a category"}
          disabled={loading}
          allowClear>
          {categories.map((cat) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type
            <Select.Option key={cat.id} value={cat.id}>
              {cat.name}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type */}
            </Select.Option>
          ))}
        </Select>
      </Section>

      {options.reportCategory && (
        // @ts-expect-error ts-migrate(2745) FIXME
        <Section>
          <div
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 12,
              color: "#0369a1",
            }}>
            <strong>Ready to publish.</strong> Save this visualization, then click the{" "}
            <strong>&quot;Publish to Reports&quot;</strong> button on the query page to
            create a report dashboard tagged with this category.
          </div>
        </Section>
      )}
    </React.Fragment>
  );
}

PublishSettings.propTypes = EditorPropTypes;
