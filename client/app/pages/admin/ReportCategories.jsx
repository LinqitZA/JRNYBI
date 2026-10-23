import React, { useState, useEffect, useCallback, useMemo } from "react";
import Button from "antd/lib/button";
import Input from "antd/lib/input";
import Modal from "antd/lib/modal";
import Table from "antd/lib/table";
import Popconfirm from "antd/lib/popconfirm";
import Form from "antd/lib/form";
import Tooltip from "antd/lib/tooltip";
import Select from "antd/lib/select";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
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

import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import RequireAdmin from "@/components/ApplicationArea/RequireAdmin";
import wrapSettingsTab from "@/components/SettingsWrapper";
import { axios } from "@/services/axios";
import notification from "@/services/notification";
import routes from "@/services/routes";
import { buildCategoryTree, flattenTree, descendantIds, moveAmongSiblings } from "@/lib/reportCategoryTree";

import "./ReportCategories.less";

// Icon mapping for display
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

const ICON_OPTIONS = Object.keys(ICON_MAP);

function CategoryIcon({ icon, color, size = 18 }) {
  const IconComponent = ICON_MAP[icon] || FolderOutlined;
  return <IconComponent style={{ fontSize: size, color: color || "#6b7280" }} />;
}

// Value of the "Top level" option in the parent picker (sent to the API as null)
const TOP_LEVEL = "";

// The backend's error text from a failed request, or the fallback.
function apiErrorMessage(err, fallback) {
  const data = err?.response?.data;
  return data?.error || data?.message || fallback;
}

function CategoryFormModal({ visible, category, onSave, onCancel, categories }) {
  const [form] = Form.useForm();
  const isEdit = !!category;

  // Parent choices, indented by depth. A folder can't move under itself or its own sub-folders.
  const parentOptions = useMemo(() => {
    const tree = buildCategoryTree(categories);
    const excluded = new Set(category ? [category.id, ...descendantIds(tree, category.id)] : []);
    return flattenTree(tree).filter(row => !excluded.has(row.category.id));
  }, [categories, category]);

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(
        category
          ? { ...category, parent: category.parent || TOP_LEVEL }
          : {
              name: "",
              icon: "folder",
              color: "#6b7280",
              description: "",
              parent: TOP_LEVEL,
            }
      );
    }
  }, [visible, category, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSave({ ...values, parent: values.parent || null });
    } catch (_) {
      // validation failed
    }
  };

  return (
    <Modal
      title={isEdit ? "Edit Category" : "New Category"}
      visible={visible}
      onOk={handleOk}
      onCancel={onCancel}
      okText={isEdit ? "Save" : "Create"}
      destroyOnClose>
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="name"
          label="Name"
          rules={[
            { required: true, message: "Please enter a category name" },
            { max: 64, message: "Name must be 64 characters or fewer" },
          ]}>
          <Input placeholder="e.g. Sales" />
        </Form.Item>

        {!isEdit && (
          <Form.Item
            name="id"
            label="ID (slug)"
            extra="Auto-generated from name if left blank. Lowercase, hyphens, and underscores only."
            rules={[
              {
                pattern: /^[a-z0-9][a-z0-9_-]{0,62}$|^$/,
                message: "Must be lowercase alphanumeric with hyphens/underscores",
              },
            ]}>
            <Input placeholder="auto-generated" />
          </Form.Item>
        )}

        <Form.Item
          name="parent"
          label="Parent folder"
          extra="Leave as Top level for a folder of its own in the Reports navigation.">
          <Select data-test="ReportCategoryParent" showSearch optionFilterProp="label">
            <Select.Option value={TOP_LEVEL} label="Top level">
              Top level
            </Select.Option>
            {parentOptions.map(({ category: option, depth }) => (
              <Select.Option key={option.id} value={option.id} label={option.name}>
                <span style={{ paddingLeft: depth * 16 }}>{option.name}</span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="icon" label="Icon">
          <div className="icon-picker">
            {ICON_OPTIONS.map(iconName => {
              const currentIcon = form.getFieldValue("icon") || "folder";
              return (
                <Tooltip key={iconName} title={iconName}>
                  <button
                    type="button"
                    className={`icon-option ${currentIcon === iconName ? "selected" : ""}`}
                    onClick={() => form.setFieldsValue({ icon: iconName })}>
                    <CategoryIcon icon={iconName} color={currentIcon === iconName ? "#2563eb" : "#6b7280"} size={20} />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </Form.Item>

        <Form.Item
          name="color"
          label="Color"
          rules={[{ pattern: /^#[0-9a-fA-F]{6}$/, message: "Must be a valid hex color (#RRGGBB)" }]}>
          <div className="color-picker-row">
            <Input
              style={{ width: 120 }}
              placeholder="#2563eb"
              value={form.getFieldValue("color")}
              onChange={e => form.setFieldsValue({ color: e.target.value })}
            />
            <input
              type="color"
              className="color-swatch"
              value={form.getFieldValue("color") || "#6b7280"}
              onChange={e => form.setFieldsValue({ color: e.target.value })}
            />
            {["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#e11d48", "#6b7280"].map(c => (
              <button
                key={c}
                type="button"
                className="color-preset"
                style={{ backgroundColor: c }}
                onClick={() => form.setFieldsValue({ color: c })}
              />
            ))}
          </div>
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ max: 256, message: "Description must be 256 characters or fewer" }]}>
          <Input.TextArea rows={2} placeholder="Short description of this category" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ReportCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const fetchCategories = useCallback(() => {
    setLoading(true);
    axios
      .get("api/jrny/report-categories")
      .then(res => {
        setCategories(res.categories || []);
      })
      .catch(() => {
        notification.error("Failed to load report categories.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreate = () => {
    setEditingCategory(null);
    setModalVisible(true);
  };

  const handleEdit = cat => {
    setEditingCategory(cat);
    setModalVisible(true);
  };

  const handleSave = async values => {
    try {
      if (editingCategory) {
        // Update existing
        await axios.put(`api/jrny/report-categories/${editingCategory.id}`, values);
        notification.success("Category updated.");
      } else {
        // Create new
        await axios.post("api/jrny/report-categories", values);
        notification.success("Category created.");
      }
      setModalVisible(false);
      setEditingCategory(null);
      fetchCategories();
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to save category.");
      notification.error(msg);
    }
  };

  const handleDelete = async catId => {
    try {
      await axios.delete(`api/jrny/report-categories/${catId}`);
      notification.success("Category deleted.");
      fetchCategories();
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to delete category.");
      notification.error(msg);
    }
  };

  // Folders shown depth first and indented; the arrows move a folder among its siblings.
  const rows = useMemo(
    () => flattenTree(buildCategoryTree(categories)).map(({ category, depth }) => ({ ...category, depth })),
    [categories]
  );

  const handleMove = async (catId, direction) => {
    const newCategories = moveAmongSiblings(categories, catId, direction);
    if (!newCategories) return;

    try {
      // Bulk PUT of the whole list; each entry keeps its parent
      const res = await axios.put("api/jrny/report-categories", newCategories);
      setCategories(res.categories || newCategories);
      notification.success("Order updated.");
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to reorder categories.");
      notification.error(msg);
    }
  };

  const columns = [
    {
      title: "",
      key: "order",
      width: 80,
      render: (_, record) => (
        <div className="order-controls">
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            aria-label={`Move ${record.name} up`}
            disabled={!moveAmongSiblings(categories, record.id, -1)}
            onClick={() => handleMove(record.id, -1)}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            aria-label={`Move ${record.name} down`}
            disabled={!moveAmongSiblings(categories, record.id, 1)}
            onClick={() => handleMove(record.id, 1)}
          />
        </div>
      ),
    },
    {
      title: "Icon",
      key: "icon",
      width: 60,
      render: (_, record) => (
        <div className="category-icon-cell" style={{ backgroundColor: record.color + "18" }}>
          <CategoryIcon icon={record.icon} color={record.color} size={20} />
        </div>
      ),
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text, record) => (
        <div style={{ paddingLeft: record.depth * 24 }} data-test={`ReportCategoryRow-${record.id}`}>
          {record.depth > 0 && <FolderOutlined className="category-subfolder-icon" style={{ marginRight: 6 }} />}
          <strong>{text}</strong>
          <div className="category-id-label">{record.id}</div>
        </div>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: "Color",
      dataIndex: "color",
      key: "color",
      width: 100,
      render: color => (
        <div className="color-preview">
          <span className="color-dot" style={{ backgroundColor: color }} />
          <code>{color}</code>
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <div className="action-buttons">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title={`Delete "${record.name}"?`}
            description="Reports using this category will become uncategorized. A folder with sub-folders can't be deleted."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okType="danger">
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="report-categories-page">
      <div className="page-header-row">
        <div>
          <h3>Report Categories</h3>
          <p className="page-subtitle">
            Manage the folders that organize reports in the Reports navigation. Pick a parent folder to nest a
            folder; use the arrows to reorder a folder among its siblings.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          New Category
        </Button>
      </div>

      <Table
        dataSource={rows}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: "No categories defined. Click 'New Category' to create one." }}
      />

      <div className="uncategorized-note">
        <FolderOutlined style={{ marginRight: 8 }} />
        Reports without a matching category will appear under <strong>Uncategorized</strong> in the Reports page.
      </div>

      <CategoryFormModal
        visible={modalVisible}
        category={editingCategory}
        onSave={handleSave}
        onCancel={() => {
          setModalVisible(false);
          setEditingCategory(null);
        }}
        categories={categories}
      />
    </div>
  );
}

const ReportCategoriesPage = wrapSettingsTab(
  "Admin.ReportCategories",
  {
    permission: "admin",
    title: "Report Categories",
    path: "admin/report-categories",
    order: 8,
  },
  ReportCategories
);

routes.register(
  "Admin.ReportCategories",
  routeWithUserSession({
    path: "/admin/report-categories",
    title: "Report Categories",
    render: pageProps => (
      <RequireAdmin>
        <ReportCategoriesPage {...pageProps} />
      </RequireAdmin>
    ),
  })
);

export default ReportCategories;
