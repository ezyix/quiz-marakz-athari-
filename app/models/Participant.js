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

    completedAt: {
      type: Date,
      default: null,
    },

    score: {
      type: Number,
      default: 0,
    },

    totalQuestions: {
      type: Number,
      default: 0,
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

const existingParticipant = mongoose.models.Participant;
const hasNamePhoneIndex = existingParticipant?.schema.indexes().some(
  ([fields, options]) =>
    options.unique && fields.fullName === 1 && fields.whatsapp === 1
);
if (existingParticipant && !hasNamePhoneIndex) {
  mongoose.deleteModel("Participant");
}

const Participant = mongoose.models.Participant || mongoose.model("Participant", ParticipantSchema);

export default Participant;