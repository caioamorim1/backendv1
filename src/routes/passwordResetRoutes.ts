import { Router } from "express";
import { PasswordResetController } from "../controllers/passwordResetController";

const router = Router();
const controller = new PasswordResetController();

/**
 * @route POST /password-reset/request
 * @desc Request password reset - sends email with token
 * @body { email: string }
 * @access Public
 */
router.post("/request", controller.requestReset);

/**
 * @route POST /password-reset/reset
 * @desc Reset password using token
 * @body { token: string, newPassword: string }
 * @access Public
 */
router.post("/reset", controller.resetPassword);

/**
 * @route GET /password-reset/verify/:token
 * @desc Verify if token is valid
 * @access Public
 */
router.get("/verify/:token", controller.verifyToken);

/**
 * @route DELETE /password-reset/cleanup
 * @desc Clean up expired tokens (admin only)
 * @access Admin
 * @todo Add admin authentication middleware
 */
router.delete("/cleanup", controller.cleanupExpired);

export default router;
