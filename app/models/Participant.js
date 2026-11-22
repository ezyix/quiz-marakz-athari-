import mongoose from "mongoose";

const ParticipantSchema = new mongoose.Schema(
  {
    participantId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female"],
      required: true,
    },

    age: {
      type: Number,
      required: true,
      min: 1,
      max: 120,
    },

    whatsapp: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["attending", "completed"],
      default: "attending",
      index: true,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    answers: {
      type: Map,
      of: String,
      default: {},
    },

    score: {
      type: Number,
      default: 0,
    },

    totalQuestions: {
      type: Number,
      default: 0,
    },

    // Submitted after the time limit (+ grace); answers were still scored.
    late: {
      type: Boolean,
      default: false,
    },

    completionReason: {
      type: String,
      enum: ["manual", "timeout", null],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ParticipantSchema.index(
  { fullName: 1, whatsapp: 1 },
  { unique: true, name: "unique_participant_name_whatsapp" }
);
ParticipantSchema.index({ createdAt: -1 });

const existingParticipant = mongoose.models.Participant;
const hasNamePhoneIndex = existingParticipant?.schema.indexes().some(
  ([fields, options]) =>
    options.unique && fields.fullName === 1 && fields.whatsapp === 1
);
if (
  existingParticipant &&
  (!hasNamePhoneIndex ||
    !existingParticipant.schema.path("late") ||
    !existingParticipant.schema.path("expiresAt") ||
    !existingParticipant.schema.path("answers") ||
    !existingParticipant.schema.path("completionReason"))
) {
  mongoose.deleteModel("Participant");
}

const Participant = mongoose.models.Participant || mongoose.model("Participant", ParticipantSchema);

export default Participant;