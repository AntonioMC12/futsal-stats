import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CsvFileDownloader {
  download(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  }
}
