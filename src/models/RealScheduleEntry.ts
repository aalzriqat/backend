import mongoose, { Schema } from 'mongoose';
import { IRealScheduleEntry, IDailyShift } from '../types';

const dailyShiftSchema = new Schema<IDailyShift>({
  day: {
    type: String,
    required: [true, 'Day is required'],
    enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  },
  working: {
    type: Boolean,
    required: [true, 'Working status is required']
  },
  shiftStart: {
    type: String,
    default: null,
    validate: {
      validator: function(v: string | null) {
        if (v === null) return true;
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Shift start must be in HH:mm format or null'
    }
  },
  shiftEnd: {
    type: String,
    default: null,
    validate: {
      validator: function(v: string | null) {
        if (v === null) return true;
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Shift end must be in HH:mm format or null'
    }
  }
}, { _id: false });

const realScheduleEntrySchema = new Schema<IRealScheduleEntry>({
  userLogin: {
    type: String,
    required: [true, 'User login is required'],
    unique: true,
    trim: true,
    index: true
  },
  skill: {
    type: String,
    required: [true, 'Skill is required'],
    trim: true,
    index: true
  },
  weekOff: [{
    type: String,
    trim: true
  }],
  dailyShifts: {
    type: [dailyShiftSchema],
    required: [true, 'Daily shifts are required'],
    validate: {
      validator: function(shifts: IDailyShift[]) {
        return shifts.length === 7;
      },
      message: 'Must have exactly 7 daily shifts (one for each day of the week)'
    }
  },
  lunch: {
    type: String,
    required: [true, 'Lunch time is required'],
    validate: {
      validator: function(v: string) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
      },
      message: 'Lunch time must be in HH:mm:ss format'
    }
  },
  break1: {
    type: String,
    required: [true, 'Break1 time is required'],
    validate: {
      validator: function(v: string) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
      },
      message: 'Break1 time must be in HH:mm:ss format'
    }
  },
  break2: {
    type: String,
    required: [true, 'Break2 time is required'],
    validate: {
      validator: function(v: string) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
      },
      message: 'Break2 time must be in HH:mm:ss format'
    }
  }
}, {
  timestamps: true,
  collection: 'realScheduleEntries'
});

// Indexes for performance
realScheduleEntrySchema.index({ userLogin: 1 });
realScheduleEntrySchema.index({ skill: 1 });
realScheduleEntrySchema.index({ 'dailyShifts.working': 1 });
realScheduleEntrySchema.index({ 'dailyShifts.day': 1, 'dailyShifts.working': 1 });

// Validation to ensure working shifts have start and end times
realScheduleEntrySchema.pre('save', function(next) {
  for (const shift of this.dailyShifts) {
    if (shift.working && (!shift.shiftStart || !shift.shiftEnd)) {
      return next(new Error(`Working shift on ${shift.day} must have both start and end times`));
    }
    if (!shift.working && (shift.shiftStart || shift.shiftEnd)) {
      return next(new Error(`Non-working shift on ${shift.day} should not have start or end times`));
    }
  }
  next();
});

// Method to get working days
realScheduleEntrySchema.methods.getWorkingDays = function() {
  return this.dailyShifts.filter((shift: IDailyShift) => shift.working);
};

// Method to get shift for specific day
realScheduleEntrySchema.methods.getShiftForDay = function(day: string) {
  return this.dailyShifts.find((shift: IDailyShift) => shift.day === day);
};

// Method to calculate total weekly hours
realScheduleEntrySchema.methods.getTotalWeeklyHours = function() {
  let totalMinutes = 0;
  
  for (const shift of this.dailyShifts) {
    if (shift.working && shift.shiftStart && shift.shiftEnd) {
      const [startHour, startMin] = shift.shiftStart.split(':').map(Number);
      const [endHour, endMin] = shift.shiftEnd.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      totalMinutes += endMinutes - startMinutes;
    }
  }
  
  return totalMinutes / 60; // Convert to hours
};

export const RealScheduleEntry = mongoose.model<IRealScheduleEntry>('RealScheduleEntry', realScheduleEntrySchema);
