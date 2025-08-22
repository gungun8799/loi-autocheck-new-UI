import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: false,
    default: ''
  },
  fileType: {
    type: String,
    required: true,
    enum: ['pdf', 'image', 'excel']
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  ocrText: {
    type: String
  },
  extractedData: {
    type: mongoose.Schema.Types.Mixed
  },
  geminiOutput: {
    type: String
  },
  validationResult: {
    type: mongoose.Schema.Types.Mixed
  },
  promptKey: {
    type: String
  },
  contractNumber: {
    type: String
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'completed', 'failed'],
    default: 'uploaded'
  },
  processingLog: [{
    step: String,
    status: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for faster queries
documentSchema.index({ contractNumber: 1 });
documentSchema.index({ status: 1 });
documentSchema.index({ createdAt: -1 });

export default mongoose.model('Document', documentSchema);