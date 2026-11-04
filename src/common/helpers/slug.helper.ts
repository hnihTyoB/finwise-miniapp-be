export function toSlug(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .slice(0, 200)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateExportFileName(jobId: string, exportType: string): string {
  const safeJobId = (jobId || 'job').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = getExtensionByType(exportType);
  return `export-${safeJobId.slice(0, 8)}-${timestamp}.${ext}`;
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
