import React, { useState, useEffect, useCallback } from "react";
import Button from "antd/lib/button";
import Input from "antd/lib/input";
import Modal from "antd/lib/modal";
import Table from "antd/lib/table";
import Popconfirm from "antd/lib/popconfirm";
import Form from "antd/lib/form";
import Tooltip from "antd/lib/tooltip";
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

function CategoryFormModal({ visible, category, onSave, onCancel, existingIds }) {
  const [form] = Form.useForm();
  const isEdit = !!category;

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(
        category || {
          name: "",
          icon: "folder",
          color: "#6b7280",
          description: "",
        }
      );
    }
  }, [visible, category, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSave(values);
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
      const msg = err?.response?.data?.error || "Failed to save category.";
      notification.error(msg);
    }
  };

  const handleDelete = async catId => {
    try {
      await axios.delete(`api/jrny/report-categories/${catId}`);
      notification.success("Category deleted.");
      fetchCategories();
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to delete category.";
      notification.error(msg);
    }
  };

  const handleMove = async (index, direction) => {
    const newCategories = [...categories];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newCategories.length) return;

    // Swap
    [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];

    try {
      const res = await axios.put("api/jrny/report-categories", newCategories);
      setCategories(res.categories || newCategories);
      notification.success("Order updated.");
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to reorder categories.";
      notification.error(msg);
    }
  };

  const columns = [
    {
      title: "",
      key: "order",
      width: 80,
      render: (_, _record, index) => (
        <div className="order-controls">
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={index === 0}
            onClick={() => handleMove(index, -1)}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={index === categories.length - 1}
            onClick={() => handleMove(index, 1)}
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
        <div>
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
            description="Reports using this category will become uncategorized."
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
            Manage the categories that organize reports in the Reports navigation. Drag to reorder.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          New Category
        </Button>
      </div>

      <Table
        dataSource={categories}
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
        existingIds={categories.map(c => c.id)}
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
