import { parseSQLContext } from "./sqlContext";

describe("parseSQLContext", () => {
  // ---- Edge cases / empty input -----------------------------------------------

  describe("edge cases", () => {
    test("returns defaults for empty query", () => {
      const result = parseSQLContext("", 0);
      expect(result.clause).toBeNull();
      expect(result.tables).toEqual([]);
      expect(result.currentPrefix).toBe("");
      expect(result.completing).toBe("keyword");
    });

    test("returns defaults for null query", () => {
      const result = parseSQLContext(null, 0);
      expect(result.clause).toBeNull();
      expect(result.tables).toEqual([]);
    });

    test("returns defaults for undefined query", () => {
      const result = parseSQLContext(undefined, 5);
      expect(result.clause).toBeNull();
      expect(result.tables).toEqual([]);
    });

    test("handles cursor at position 0", () => {
      const result = parseSQLContext("SELECT * FROM orders", 0);
      expect(result.clause).toBeNull();
    });

    test("handles cursor beyond text length", () => {
      const query = "SELECT 1";
      const result = parseSQLContext(query, 999);
      expect(result.clause).toBe("SELECT");
    });
  });

  // ---- Clause detection -------------------------------------------------------

  describe("clause detection", () => {
    test("detects SELECT clause", () => {
      const result = parseSQLContext("SELECT col", 10);
      expect(result.clause).toBe("SELECT");
    });

    test("detects FROM clause", () => {
      const result = parseSQLContext("SELECT * FROM ", 14);
      expect(result.clause).toBe("FROM");
    });

    test("detects WHERE clause", () => {
      const result = parseSQLContext("SELECT * FROM orders WHERE status", 33);
      expect(result.clause).toBe("WHERE");
    });

    test("detects JOIN clause", () => {
      const result = parseSQLContext("SELECT * FROM orders JOIN ", 25);
      expect(result.clause).toBe("JOIN");
    });

    test("detects LEFT JOIN clause", () => {
      const result = parseSQLContext("SELECT * FROM orders LEFT JOIN ", 31);
      expect(result.clause).toBe("LEFT JOIN");
    });

    test("detects ON clause", () => {
      const result = parseSQLContext("SELECT * FROM orders o JOIN customers c ON c.", 45);
      expect(result.clause).toBe("ON");
    });

    test("detects ORDER BY clause", () => {
      const result = parseSQLContext("SELECT * FROM orders ORDER BY ", 30);
      expect(result.clause).toBe("ORDER BY");
    });

    test("detects GROUP BY clause", () => {
      const result = parseSQLContext("SELECT status, count(*) FROM orders GROUP BY ", 46);
      expect(result.clause).toBe("GROUP BY");
    });

    test("detects HAVING clause", () => {
      const query = "SELECT status, count(*) FROM orders GROUP BY status HAVING ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("HAVING");
    });

    test("detects LIMIT clause", () => {
      const query = "SELECT * FROM orders LIMIT ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("LIMIT");
    });
  });

  // ---- Table extraction -------------------------------------------------------

  describe("table extraction", () => {
    test("extracts simple table from FROM", () => {
      const query = "SELECT * FROM orders WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toEqual([
        { schema: null, name: "orders", alias: null },
      ]);
    });

    test("extracts table with alias", () => {
      const query = "SELECT * FROM orders o WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toEqual([
        { schema: null, name: "orders", alias: "o" },
      ]);
    });

    test("extracts table with AS alias", () => {
      const query = "SELECT * FROM orders AS o WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toEqual([
        { schema: null, name: "orders", alias: "o" },
      ]);
    });

    test("extracts schema-qualified table", () => {
      const query = "SELECT * FROM sales.sales_orders WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toEqual([
        { schema: "sales", name: "sales_orders", alias: null },
      ]);
    });

    test("extracts schema-qualified table with alias", () => {
      const query = "SELECT * FROM sales.sales_orders so WHERE so.";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toEqual([
        { schema: "sales", name: "sales_orders", alias: "so" },
      ]);
    });

    test("extracts multiple tables from FROM with commas", () => {
      const query = "SELECT * FROM orders o, customers c WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0]).toEqual({ schema: null, name: "orders", alias: "o" });
      expect(result.tables[1]).toEqual({ schema: null, name: "customers", alias: "c" });
    });

    test("extracts tables from JOIN", () => {
      const query = "SELECT * FROM orders o JOIN customers c ON o.cust_id = c.id WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0]).toEqual({ schema: null, name: "orders", alias: "o" });
      expect(result.tables[1]).toEqual({ schema: null, name: "customers", alias: "c" });
    });

    test("extracts tables from multiple JOINs", () => {
      const query =
        "SELECT * FROM orders o " +
        "JOIN customers c ON o.cust_id = c.id " +
        "LEFT JOIN products p ON o.prod_id = p.id " +
        "WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toHaveLength(3);
      expect(result.tables[0].name).toBe("orders");
      expect(result.tables[1].name).toBe("customers");
      expect(result.tables[2].name).toBe("products");
    });

    test("extracts schema-qualified tables from JOIN", () => {
      const query =
        "SELECT * FROM reporting.v_sales_orders so " +
        "JOIN core.customers c ON so.customer_id = c.id WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0]).toEqual({ schema: "reporting", name: "v_sales_orders", alias: "so" });
      expect(result.tables[1]).toEqual({ schema: "core", name: "customers", alias: "c" });
    });

    test("does not duplicate tables", () => {
      const query = "SELECT * FROM orders o WHERE o.id = 1";
      const result = parseSQLContext(query, query.length);
      // 'orders' should appear only once
      const ordersTables = result.tables.filter(t => t.name === "orders");
      expect(ordersTables).toHaveLength(1);
    });
  });

  // ---- Current prefix ---------------------------------------------------------

  describe("currentPrefix", () => {
    test("extracts partial identifier", () => {
      const query = "SELECT ord";
      const result = parseSQLContext(query, query.length);
      expect(result.currentPrefix).toBe("ord");
    });

    test("extracts schema-qualified prefix", () => {
      const query = "SELECT * FROM sales.sal";
      const result = parseSQLContext(query, query.length);
      expect(result.currentPrefix).toBe("sales.sal");
    });

    test("extracts alias.column prefix", () => {
      const query = "SELECT * FROM orders o WHERE o.stat";
      const result = parseSQLContext(query, query.length);
      expect(result.currentPrefix).toBe("o.stat");
    });

    test("returns empty prefix after space", () => {
      const query = "SELECT * FROM ";
      const result = parseSQLContext(query, query.length);
      expect(result.currentPrefix).toBe("");
    });

    test("returns empty prefix at start", () => {
      const result = parseSQLContext("", 0);
      expect(result.currentPrefix).toBe("");
    });
  });

  // ---- Completing type --------------------------------------------------------

  describe("completing type", () => {
    test("table in FROM clause", () => {
      const query = "SELECT * FROM ";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("table");
    });

    test("table in JOIN clause", () => {
      const query = "SELECT * FROM orders o JOIN ";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("table");
    });

    test("column in SELECT clause", () => {
      const query = "SELECT ";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("column");
    });

    test("column in WHERE clause", () => {
      const query = "SELECT * FROM orders WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("column");
    });

    test("column in ORDER BY clause", () => {
      const query = "SELECT * FROM orders ORDER BY ";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("column");
    });

    test("alias_column when prefix is alias-qualified", () => {
      const query = "SELECT * FROM orders o WHERE o.stat";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("alias_column");
    });

    test("table when prefix is schema-qualified but not alias", () => {
      const query = "SELECT * FROM reporting.v_";
      const result = parseSQLContext(query, query.length);
      expect(result.completing).toBe("table");
    });
  });

  // ---- Incomplete / partial SQL -----------------------------------------------

  describe("incomplete SQL handling", () => {
    test("handles SELECT without FROM", () => {
      const result = parseSQLContext("SELECT ", 7);
      expect(result.clause).toBe("SELECT");
      expect(result.tables).toEqual([]);
    });

    test("handles just a keyword", () => {
      const result = parseSQLContext("SELECT", 6);
      expect(result.clause).toBe("SELECT");
    });

    test("handles partially typed FROM table", () => {
      const query = "SELECT * FROM ord";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("FROM");
      expect(result.currentPrefix).toBe("ord");
      expect(result.completing).toBe("table");
    });

    test("handles query with trailing comma in SELECT", () => {
      const query = "SELECT col1, ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("SELECT");
    });

    test("handles partially typed WHERE condition", () => {
      const query = "SELECT * FROM orders WHERE sta";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("WHERE");
      expect(result.currentPrefix).toBe("sta");
      expect(result.completing).toBe("column");
    });

    test("handles multi-line SQL", () => {
      const query = "SELECT *\nFROM orders o\nWHERE o.status = 'active'\nORDER BY ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("ORDER BY");
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].name).toBe("orders");
    });
  });

  // ---- Comments and strings ---------------------------------------------------

  describe("comments and strings", () => {
    test("ignores single-line comment", () => {
      const query = "SELECT * -- FROM fake_table\nFROM orders WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("WHERE");
      // Should NOT extract fake_table from the comment
      expect(result.tables.map(t => t.name)).not.toContain("fake_table");
      expect(result.tables.map(t => t.name)).toContain("orders");
    });

    test("ignores block comment", () => {
      const query = "SELECT * /* FROM fake_table */ FROM orders WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("WHERE");
      expect(result.tables.map(t => t.name)).not.toContain("fake_table");
      expect(result.tables.map(t => t.name)).toContain("orders");
    });

    test("ignores string literal containing keywords", () => {
      const query = "SELECT * FROM orders WHERE status = 'FROM WHERE' AND ";
      const result = parseSQLContext(query, query.length);
      // The last real clause should still be WHERE (the string 'FROM WHERE' is neutralised)
      expect(result.clause).toBe("WHERE");
    });
  });

  // ---- Subqueries -------------------------------------------------------------

  describe("subquery handling", () => {
    test("scopes clause to innermost subquery", () => {
      const query = "SELECT * FROM orders WHERE id IN (SELECT order_id FROM ";
      const result = parseSQLContext(query, query.length);
      // Inside the subquery, we're in a FROM clause
      expect(result.clause).toBe("FROM");
    });

    test("does not crash on unmatched parentheses", () => {
      const query = "SELECT * FROM (SELECT * FROM orders WHERE ";
      const result = parseSQLContext(query, query.length);
      // Should still return a valid result, not throw
      expect(result.clause).toBe("WHERE");
    });

    test("handles subquery in FROM clause", () => {
      const query = "SELECT * FROM (SELECT id, name FROM products) p WHERE p.";
      // Cursor is after the subquery, back in the outer query
      const result = parseSQLContext(query, query.length);
      expect(result.currentPrefix).toBe("p.");
    });
  });

  // ---- Complex real-world queries ---------------------------------------------

  describe("real-world queries", () => {
    test("JRNY-style reporting query", () => {
      const query =
        "SELECT\n" +
        "  so.order_date,\n" +
        "  c.customer_name,\n" +
        "  SUM(so.total_amount) AS revenue\n" +
        "FROM reporting.v_sales_orders so\n" +
        "JOIN core.customers c ON so.customer_id = c.id\n" +
        "WHERE so.order_date BETWEEN '{{ start_date }}' AND '{{ end_date }}'\n" +
        "GROUP BY so.order_date, c.customer_name\n" +
        "ORDER BY ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("ORDER BY");
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0]).toEqual({
        schema: "reporting",
        name: "v_sales_orders",
        alias: "so",
      });
      expect(result.tables[1]).toEqual({
        schema: "core",
        name: "customers",
        alias: "c",
      });
    });

    test("CTE / WITH query", () => {
      const query =
        "WITH monthly AS (\n" +
        "  SELECT date_trunc('month', order_date) AS month, SUM(amount) AS total\n" +
        "  FROM sales.orders\n" +
        "  GROUP BY 1\n" +
        ")\n" +
        "SELECT * FROM monthly WHERE ";
      const result = parseSQLContext(query, query.length);
      expect(result.clause).toBe("WHERE");
      // Should find tables from outer query
      expect(result.tables.map(t => t.name)).toContain("monthly");
    });

    test("cursor in middle of query (not at end)", () => {
      const query = "SELECT col1 FROM orders WHERE status = 'active' ORDER BY created_at";
      // Put cursor at position 20 (somewhere in FROM clause, after "orders")
      const pos = "SELECT col1 FROM ord".length;
      const result = parseSQLContext(query, pos);
      expect(result.clause).toBe("FROM");
      expect(result.currentPrefix).toBe("ord");
    });
  });
});
