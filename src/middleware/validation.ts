import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      res.status(400).json({
        success: false,
        message: 'Validation Error',
        error: errorMessage
      });
      return;
    }

    next();
  };
};

// Validation schemas
export const schemas = {
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  }),

  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    firstName: Joi.string().max(50).required(),
    lastName: Joi.string().max(50).required(),
    role: Joi.string().valid('Employee', 'Manager', 'WorkFlowManagement', 'Developer').default('Employee'),
    skills: Joi.array().items(
      Joi.string().valid('PhoneMU', 'phoneOnly', 'MuOnly', 'Email', 'General', 'Specialty')
    ).required(),
    marketplace: Joi.string().valid('AE', 'SA', 'UK', 'EG').required()
  }),

  updateUser: Joi.object({
    firstName: Joi.string().max(50),
    lastName: Joi.string().max(50),
    role: Joi.string().valid('Employee', 'Manager', 'Admin', 'Developer'),
    skills: Joi.array().items(
      Joi.string().valid('PhoneMU', 'phoneOnly', 'MuOnly', 'Email', 'General', 'Specialty')
    ),
    marketplace: Joi.string().valid('AE', 'SA', 'UK', 'EG')
  }),

  createShift: Joi.object({
    userId: Joi.string().required(),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    startTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    endTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    type: Joi.string().valid('Day Shift', 'Evening Shift', 'Morning Shift').required(),
    skills: Joi.array().items(
      Joi.string().valid('PhoneMU', 'phoneOnly', 'MuOnly', 'Email', 'General', 'Specialty')
    ).required(),
    marketplace: Joi.string().valid('AE', 'SA', 'UK', 'EG').required(),
    status: Joi.string().valid('confirmed', 'pending', 'swap-requested', 'cancelled').default('confirmed')
  }),

  createSwapRequest: Joi.object({
    requesterShiftId: Joi.string().required(),
    targetUserId: Joi.string().required(),
    targetShiftId: Joi.string().required(),
    message: Joi.string().max(500)
  }),

  createSwapIntent: Joi.object({
    originalShiftId: Joi.string().required(),
    preferredTimeSlots: Joi.array().items(
      Joi.string().valid('morning', 'day', 'evening', 'any')
    ).default(['any']),
    preferredMarketplaces: Joi.array().items(
      Joi.string().valid('AE', 'SA', 'UK', 'EG')
    ).default([]),
    skillFlexibility: Joi.boolean().default(false),
    maxDaysOut: Joi.number().min(1).max(30).default(14),
    priority: Joi.number().min(1).max(5).default(3),
    notes: Joi.string().max(500).allow('').optional()
  }),

  updateSwapIntent: Joi.object({
    preferredTimeSlots: Joi.array().items(
      Joi.string().valid('morning', 'day', 'evening', 'any')
    ),
    preferredMarketplaces: Joi.array().items(
      Joi.string().valid('AE', 'SA', 'UK', 'EG')
    ),
    skillFlexibility: Joi.boolean(),
    maxDaysOut: Joi.number().min(1).max(30),
    priority: Joi.number().min(1).max(5),
    notes: Joi.string().max(500).allow('').optional()
  }),

  updateUserPreferences: Joi.object({
    autoMatchEnabled: Joi.boolean(),
    preferredTimeSlots: Joi.array().items(
      Joi.string().valid('morning', 'day', 'evening', 'any')
    ),
    preferredMarketplaces: Joi.array().items(
      Joi.string().valid('AE', 'SA', 'UK', 'EG')
    ),
    skillFlexibility: Joi.boolean(),
    maxSwapsPerWeek: Joi.number().min(0).max(7),
    notificationSettings: Joi.object({
      email: Joi.boolean(),
      push: Joi.boolean(),
      sms: Joi.boolean()
    })
  }),

  // Multi-hop Swap Chain Validation Schemas
  detectSwapChains: Joi.object({
    maxChainLength: Joi.number().min(3).max(10).default(5),
    minChainScore: Joi.number().min(0).max(100).default(60),
    includePartialMatches: Joi.boolean().default(true),
    timeWindowDays: Joi.number().min(1).max(90).default(30)
  }),

  approveChainParticipation: Joi.object({
    reason: Joi.string().max(500).allow('').optional()
  }),

  rejectChainParticipation: Joi.object({
    reason: Joi.string().max(500).required()
  })
};
