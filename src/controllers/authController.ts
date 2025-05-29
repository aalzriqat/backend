import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { config } from '../config';
import { logger } from '../utils/logger';
import { LoginRequest, RegisterRequest, ApiResponse, AuthResponse } from '../types';

const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  } as jwt.SignOptions);
};

export const login = async (req: Request<{}, ApiResponse<AuthResponse>, LoginRequest>, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
      return;
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
      return;
    }

    // Generate token
    const token = generateToken((user._id as string).toString());

    // Remove password from user object
    const userObject = user.toObject() as any;
    delete userObject.password;

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      data: {
        user: userObject,
        token
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

export const register = async (req: Request<{}, ApiResponse<AuthResponse>, RegisterRequest>, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, role, skills, marketplace } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
      return;
    }

    // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      skills,
      marketplace
    });

    await user.save();

    // Generate token
    const token = generateToken((user._id as string).toString());

    // Remove password from user object
    const userObject = user.toObject() as any;
    delete userObject.password;

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json({
      success: true,
      data: {
        user: userObject,
        token
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // User is already attached to req by authenticate middleware
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting current user'
    });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // For JWT tokens, logout is handled client-side by removing the token
    // In a more advanced implementation, you might maintain a blacklist of tokens

    logger.info(`User logged out: ${req.user?.email}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
};


