export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateExportFileName(jobId: string, exportType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = getExtensionByType(exportType);
  return `export-${jobId.slice(0, 8)}-${timestamp}.${ext}`;
}

function getExtensionByType(exportType: string): string {
  const map: Record<string, string> = {
    JSON: 'json',
    CSV: 'csv',
    XLSX: 'xlsx',
    MARKDOWN: 'md',
    MARKDOWN_ZIP: 'zip',
    FULL_ZIP: 'zip',
  };
  return map[exportType] || 'bin';
}
