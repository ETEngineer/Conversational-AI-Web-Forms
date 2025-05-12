const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true
  },
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  }],
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['draft', 'in-progress', 'submitted', 'completed'],
    default: 'in-progress'
  },
  conversationHistory: [{
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  }],
  summary: {
    type: String
  }
}, {
  timestamps: true
});


responseSchema.index({ formId: 1, submittedAt: -1 });
responseSchema.index({ submittedBy: 1 });

responseSchema.methods.addConversationEntry = function(role, content, metadata = {}) {
  this.conversationHistory.push({
    role,
    content,
    metadata
  });
  return this.save();
};

responseSchema.statics.findByForm = function(formId) {
  return this.find({ formId: formId });
};

const Response = mongoose.model('Response', responseSchema);
module.exports = Response; 