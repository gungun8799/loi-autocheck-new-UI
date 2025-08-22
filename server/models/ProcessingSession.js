import mongoose from 'mongoose';

const processingSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  promptKey: {
    type: String,
    required: true
  },
  systemType: {
    type: String,
    enum: ['simplicity', 'others']
  },
  webData: {
    url: String,
    scrapedText: String,
    geminiOutput: String,
    contractNumber: String
  },
  excelData: {
    fileName: String,
    sheetName: String,
    tableData: mongoose.Schema.Types.Mixed,
    geminiOutput: String
  },
  comparisonResult: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for faster queries
processingSessionSchema.index({ userId: 1, status: 1 });
processingSessionSchema.index({ createdAt: -1 });

export default mongoose.model('ProcessingSession', processingSessionSchema);