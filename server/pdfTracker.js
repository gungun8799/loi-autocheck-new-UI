import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PDFTracker {
  constructor() {
    this.baseDir = path.join(__dirname, 'contracts');
    this.processedDir = path.join(__dirname, 'processed');
  }

  /**
   * Extract contract number from filename
   * Format: XXXX_LOXXXX_XXXXX.pdf or XXXX_LRXXXX_XXXXX.pdf
   */
  extractContractNumber(filename) {
    const match = filename.match(/^(\d+)_(?:LO|LR)\d+_\d+\.pdf$/i);
    return match ? match[1] : null;
  }

  /**
   * Find all versions of a contract across all directories
   * Returns array of file info sorted by date (newest first)
   */
  async findAllVersions(contractNumber) {
    const versions = [];
    
    // 1. Check original contracts folder
    try {
      const contractsFiles = await fs.promises.readdir(this.baseDir);
      for (const file of contractsFiles) {
        if (file.toLowerCase().endsWith('.pdf')) {
          const fileContractNum = this.extractContractNumber(file);
          if (fileContractNum === contractNumber) {
            const filePath = path.join(this.baseDir, file);
            const stats = await fs.promises.stat(filePath);
            versions.push({
              filename: file,
              path: filePath,
              relativePath: `contracts/${file}`,
              location: 'original',
              status: 'pending',
              date: stats.mtime,
              size: stats.size
            });
          }
        }
      }
    } catch (err) {
      console.log('No contracts folder or error reading it:', err.message);
    }

    // 2. Check processed folders (daily folders)
    try {
      const dateFolders = await fs.promises.readdir(this.processedDir);
      
      for (const dateFolder of dateFolders) {
        // Skip if not a date folder (YYYY-MM-DD format)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) continue;
        
        const datePath = path.join(this.processedDir, dateFolder);
        const dateStat = await fs.promises.stat(datePath);
        
        if (!dateStat.isDirectory()) continue;
        
        // Check each subfolder (verification_passed, verification_failed, skipped)
        const subfolders = [
          { name: 'verification_passed', status: 'passed' },
          { name: 'verification_failed', status: 'failed' },
          { name: 'skipped', status: 'skipped' }
        ];
        
        for (const subfolder of subfolders) {
          const subfolderPath = path.join(datePath, subfolder.name);
          
          try {
            const files = await fs.promises.readdir(subfolderPath);
            
            for (const file of files) {
              if (file.toLowerCase().endsWith('.pdf')) {
                const fileContractNum = this.extractContractNumber(file);
                if (fileContractNum === contractNumber) {
                  const filePath = path.join(subfolderPath, file);
                  const stats = await fs.promises.stat(filePath);
                  
                  versions.push({
                    filename: file,
                    path: filePath,
                    relativePath: `processed/${dateFolder}/${subfolder.name}/${file}`,
                    location: 'processed',
                    status: subfolder.status,
                    date: stats.mtime,
                    processedDate: dateFolder,
                    size: stats.size
                  });
                }
              }
            }
          } catch (err) {
            // Subfolder doesn't exist, skip
          }
        }
      }
    } catch (err) {
      console.log('No processed folder or error reading it:', err.message);
    }

    // Sort by date (newest first)
    versions.sort((a, b) => b.date - a.date);
    
    return versions;
  }

  /**
   * Get all unique contract numbers from all directories
   * Useful for building an index
   */
  async getAllContractNumbers() {
    const contractNumbers = new Set();
    
    // Check original contracts folder
    try {
      const contractsFiles = await fs.promises.readdir(this.baseDir);
      for (const file of contractsFiles) {
        if (file.toLowerCase().endsWith('.pdf')) {
          const contractNum = this.extractContractNumber(file);
          if (contractNum) contractNumbers.add(contractNum);
        }
      }
    } catch (err) {
      // Ignore
    }

    // Check processed folders
    try {
      const dateFolders = await fs.promises.readdir(this.processedDir);
      
      for (const dateFolder of dateFolders) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) continue;
        
        const datePath = path.join(this.processedDir, dateFolder);
        const subfolders = ['verification_passed', 'verification_failed', 'skipped'];
        
        for (const subfolder of subfolders) {
          const subfolderPath = path.join(datePath, subfolder);
          
          try {
            const files = await fs.promises.readdir(subfolderPath);
            for (const file of files) {
              if (file.toLowerCase().endsWith('.pdf')) {
                const contractNum = this.extractContractNumber(file);
                if (contractNum) contractNumbers.add(contractNum);
              }
            }
          } catch (err) {
            // Subfolder doesn't exist, skip
          }
        }
      }
    } catch (err) {
      // Ignore
    }

    return Array.from(contractNumbers).sort();
  }

  /**
   * Build an index of all contracts and their versions
   * This can be cached for performance
   */
  async buildIndex() {
    const index = {};
    const contractNumbers = await this.getAllContractNumbers();
    
    for (const contractNum of contractNumbers) {
      index[contractNum] = await this.findAllVersions(contractNum);
    }
    
    return index;
  }
}

export default PDFTracker;