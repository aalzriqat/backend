import mongoose, { Schema } from 'mongoose';
import { IShift, ShiftType, ShiftStatus, Skill, Marketplace } from '../types';

const shiftSchema = new Schema<IShift>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  date: {
    type: String,
    required: [true, 'Date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:mm format']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:mm format']
  },
  type: {
    type: String,
    enum: ['Day Shift', 'Evening Shift', 'Morning Shift'] as ShiftType[],
    required: [true, 'Shift type is required']
  },
  skills: [{
    type: String,
    enum: ['PhoneMU', 'phoneOnly', 'MuOnly', 'Email', 'General', 'Specialty'] as Skill[]
  }],
  marketplace: {
    type: String,
    enum: ['AE', 'SA', 'UK', 'EG'] as Marketplace[],
    required: [true, 'Marketplace is required']
  },
  status: {
    type: String,
    enum: ['confirmed', 'pending', 'swap-requested', 'cancelled'] as ShiftStatus[],
    default: 'confirmed'
  }
}, {
  timestamps: true
});

// Indexes for performance
shiftSchema.index({ userId: 1 });
shiftSchema.index({ date: 1 });
shiftSchema.index({ marketplace: 1 });
shiftSchema.index({ skills: 1 });
shiftSchema.index({ status: 1 });
shiftSchema.index({ userId: 1, date: 1 }); // Compound index for user's shifts by date

// Validate that end time is after start time
shiftSchema.pre('save', function(next) {
  const startTime = this.startTime.split(':').map(Number);
  const endTime = this.endTime.split(':').map(Number);
  
  const startMinutes = startTime[0] * 60 + startTime[1];
  const endMinutes = endTime[0] * 60 + endTime[1];
  
  if (endMinutes <= startMinutes) {
    return next(new Error('End time must be after start time'));
  }
  
  next();
});

export const Shift = mongoose.model<IShift>('Shift', shiftSchema);
