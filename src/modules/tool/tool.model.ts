import mongoose, { model } from "mongoose";
import { ToolType } from "./tool.type";

const toolSchema = new mongoose.Schema<ToolType>(
  {
    platform: {
      type: String,
      required: true,
      unique: true,
    },
    website: {
      type: String,
      required: true,
    },
    organizations: [
      {
        name: {
          type: String,
          required: true,
        },
        login_id: {
          type: String,
          required: true,
        },
        password: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
          default: 0,
        },
        currency: {
          type: String,
          required: true,
          default: "bdt",
        },
        billing: {
          type: String,
          required: true,
          default: "onetime",
        },
        users: [
          {
            type: String,
          },
        ],
        purchase_date: {
          type: Date,
        },
        expire_date: {
          type: Date,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Tool = model<ToolType>("tool", toolSchema);
