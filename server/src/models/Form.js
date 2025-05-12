const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'multiple-choice', 'single-choice', 'date', 'file', 'number'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    type: String
  }],
  required: {
    type: Boolean,
    default: false
  },
  validation: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  dependencies: [{
    questionId: String,
    condition: mongoose.Schema.Types.Mixed
  }]
});

const formSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questions: [questionSchema],
  settings: {
    allowAnonymous: {
      type: Boolean,
      default: false
    },
    requireLogin: {
      type: Boolean,
      default: false
    },
    allowMultipleResponses: {
      type: Boolean,
      default: true
    },
  },
  chatbotConfig: {
    enabled: {
      type: Boolean,
      default: true
    },
    personality: {
      type: String,
      default: 'professional'
    },
    customPrompts: [{
      type: String
    }],
    followUpQuestions: [{
      questionId: String,
      prompts: [String]
    }]
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  publishedAt: Date,
  expiresAt: Date,
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  conversationalDialogues: {
    type: [String],
    default: []
  },
  useNlpChat: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});


formSchema.index({ creator: 1 });
formSchema.index({ status: 1 });
formSchema.index({ publishedAt: 1 });


formSchema.methods.toPublicJSON = function () {
  const obj = this.toObject();
  delete obj.creator;
  delete obj.metadata;
  return obj;
};


formSchema.statics.findByCreator = function (creatorId) {
  return this.find({ creator: creatorId });
};

formSchema.statics.findPublished = function () {
  return this.find({ status: 'published' });
};

const Form = mongoose.model('Form', formSchema);
module.exports = Form; 