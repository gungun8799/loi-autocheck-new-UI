import mongoose from 'mongoose';

const rpaLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  user: {
    type: String,
    required: true,
    default: 'System'
  },
  contractNumber: {
    type: String,
    default: null,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Processing', 'Success', 'Error', 'Warning', 'Info', 'Unknown'],
    default: 'Unknown'
  },
  actionType: {
    type: String,
    enum: ['autoprocess', 'forceprocess', 'manual', 'system'],
    default: 'system'
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true // This adds createdAt and updatedAt automatically
});

// Indexes for better query performance
rpaLogSchema.index({ timestamp: -1 });
rpaLogSchema.index({ action: 1 });
rpaLogSchema.index({ user: 1 });
rpaLogSchema.index({ contractNumber: 1 });
rpaLogSchema.index({ status: 1 });
rpaLogSchema.index({ actionType: 1 });

// Compound indexes for common query patterns
rpaLogSchema.index({ timestamp: -1, actionType: 1 });
rpaLogSchema.index({ contractNumber: 1, timestamp: -1 });

export default mongoose.model('RPALog', rpaLogSchema);