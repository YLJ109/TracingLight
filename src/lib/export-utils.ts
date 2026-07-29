"use client";

/**
 * 通用导出工具：支持 CSV / JSON / 打印 三种导出方式
 */

/** CSV 字段映射 */
export interface CsvColumn<T> {
  header: string;          // 列标题
  key: keyof T | string;   // 数据字段
  render?: (row: T) => string; // 自定义渲染
}

/** 将对象数组导出为 CSV 并下载 */
export function exportCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[],
): void {
  const BOM = "\uFEFF";

  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = col.render ? col.render(row) : String(row[col.key as keyof T] ?? "");
          return escapeCsv(val);
        })
        .join(","),
    )
    .join("\n");

  downloadFile(`${filename}.csv`, BOM + header + "\n" + body, "text/csv;charset=utf-8");
}

/** 将对象数组导出为 JSON 并下载 */
export function exportJson<T>(filename: string, data: T[]): void {
  downloadFile(`${filename}.json`, JSON.stringify(data, null, 2), "application/json");
}

/** 调用浏览器打印（适合表格/图表等） */
export function printElement(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>打印</title>
    <style>
      body { font-family: Inter, 'Noto Sans SC', sans-serif; padding: 24px; color: #1e293b; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 14px; }
      th { background: #f8fafc; font-weight: 600; }
      @media print { body { padding: 0; } }
    </style></head>
    <body>${el.innerHTML}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

/* ─── internal ─── */

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
