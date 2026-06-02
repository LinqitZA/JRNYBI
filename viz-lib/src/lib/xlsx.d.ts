/**
 * Minimal ambient type stubs for `xlsx` (SheetJS Community).
 *
 * The real `xlsx` package ships its own types; this file only exists so
 * the project type-checks before `pnpm install` has materialized xlsx
 * into node_modules. Stubs are intentionally permissive (`any`).
 */
declare module "xlsx" {
  export interface CellObject {
    t: "n" | "s" | "b" | "d" | "e" | "z";
    v?: any;
    w?: string;
    z?: string;
    f?: string;
    F?: string;
    r?: string;
    h?: string;
    c?: any[];
    l?: { Target: string; Tooltip?: string };
    s?: any;
  }

  export type WorkSheet = { [cell: string]: any };
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [name: string]: WorkSheet };
    Props?: any;
    Workbook?: any;
  }

  export interface WritingOptions {
    bookType?: "xlsx" | "xlsm" | "xlsb" | "ods" | "csv" | "txt" | "html";
    type?: "base64" | "binary" | "string" | "buffer" | "array" | "file";
    compression?: boolean;
    bookSST?: boolean;
    cellDates?: boolean;
    sheet?: string;
  }

  export namespace utils {
    function book_new(): WorkBook;
    function book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string): void;
    function encode_cell(addr: { r: number; c: number }): string;
    function decode_cell(addr: string): { r: number; c: number };
    function encode_range(range: { s: { r: number; c: number }; e: { r: number; c: number } }): string;
    function decode_range(range: string): { s: { r: number; c: number }; e: { r: number; c: number } };
    function aoa_to_sheet<T = any>(data: T[][], opts?: any): WorkSheet;
    function json_to_sheet<T = any>(data: T[], opts?: any): WorkSheet;
    function sheet_to_json<T = any>(ws: WorkSheet, opts?: any): T[];
    function sheet_to_csv(ws: WorkSheet, opts?: any): string;
  }

  export function write(wb: WorkBook, opts?: WritingOptions): any;
  export function writeFile(wb: WorkBook, filename: string, opts?: WritingOptions): void;
  export function read(data: any, opts?: any): WorkBook;
  export function readFile(filename: string, opts?: any): WorkBook;
}
