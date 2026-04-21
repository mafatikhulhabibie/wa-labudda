import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  authenticate,
  authorizeAuthenticatedActor,
  requireAdmin,
  requireUserAuth,
} from '../middlewares/auth.js';
import { requireDeviceAccess } from '../middlewares/requireDeviceAccess.js';
import {
  loginController,
  logoutController,
  meController,
  updatePasswordController,
  updateProfileController,
} from '../controllers/authController.js';
import {
  adminCreateUserController,
  adminDeleteUserController,
  adminListDevicesController,
  adminListUsersController,
  adminRegenerateApiKeyController,
} from '../controllers/adminController.js';
import { docsController } from '../controllers/docsController.js';
import {
  connectDeviceController,
  createDeviceController,
  deleteDeviceController,
  disconnectDeviceController,
  listDevicesController,
  rotateDeviceApiKeyController,
} from '../controllers/deviceController.js';
import {
  getSessionQrController,
  getSessionStatusController,
} from '../controllers/sessionController.js';
import { sendBulkController, sendController } from '../controllers/sendController.js';
import { sendUploadMaybe } from '../middlewares/sendUpload.js';
import { broadcastController } from '../controllers/broadcastController.js';
import { broadcastGuardController } from '../controllers/broadcastGuardController.js';
import {
  cancelScheduledBroadcastController,
  createScheduledBroadcastController,
  listScheduledBroadcastController,
} from '../controllers/scheduledBroadcastController.js';
import {
  createContactGroupController,
  deleteContactGroupController,
  listContactGroupsController,
  updateContactGroupController,
} from '../controllers/contactGroupController.js';
import {
  createContactController,
  deleteContactController,
  listContactsController,
  updateContactController,
} from '../controllers/contactController.js';
import {
  deleteDeviceWebhookController,
  getDeviceWebhookController,
  testDeviceWebhookController,
  upsertDeviceWebhookController,
} from '../controllers/webhookController.js';
import {
  createAutoReplyRuleController,
  deleteAutoReplyRuleController,
  getAutoReplyController,
  updateAutoReplyController,
  updateAutoReplyRuleController,
} from '../controllers/autoReplyController.js';

const router = Router();

router.post('/auth/login', asyncHandler(loginController));
router.post('/auth/logout', asyncHandler(logoutController));
router.get('/auth/me', authenticate, asyncHandler(meController));
router.patch('/auth/profile', authenticate, asyncHandler(updateProfileController));
router.patch('/auth/password', authenticate, asyncHandler(updatePasswordController));

router.use(authenticate, authorizeAuthenticatedActor);

router.get('/docs', asyncHandler(docsController));

router.get('/devices', asyncHandler(listDevicesController));
router.post('/devices', asyncHandler(createDeviceController));
router.post('/devices/:session_id/connect', asyncHandler(connectDeviceController));
router.post('/devices/:session_id/disconnect', requireDeviceAccess, asyncHandler(disconnectDeviceController));
router.post('/devices/:session_id/api-key', requireDeviceAccess, asyncHandler(rotateDeviceApiKeyController));
router.delete('/devices/:session_id', requireDeviceAccess, asyncHandler(deleteDeviceController));

router.get('/session/qr/:session_id', requireDeviceAccess, asyncHandler(getSessionQrController));
router.get('/session/status/:session_id', requireDeviceAccess, asyncHandler(getSessionStatusController));
router.delete('/session/:session_id', requireDeviceAccess, asyncHandler(deleteDeviceController));

router.post('/send', sendUploadMaybe, requireUserAuth, requireDeviceAccess, asyncHandler(sendController));
router.post('/send-bulk', requireUserAuth, requireDeviceAccess, asyncHandler(sendBulkController));

router.get('/contact-groups', asyncHandler(listContactGroupsController));
router.post('/contact-groups', asyncHandler(createContactGroupController));
router.patch('/contact-groups/:id', asyncHandler(updateContactGroupController));
router.delete('/contact-groups/:id', asyncHandler(deleteContactGroupController));

router.get('/contacts', asyncHandler(listContactsController));
router.post('/contacts', asyncHandler(createContactController));
router.patch('/contacts/:id', asyncHandler(updateContactController));
router.delete('/contacts/:id', asyncHandler(deleteContactController));

router.get('/webhooks/:session_id', requireDeviceAccess, asyncHandler(getDeviceWebhookController));
router.put('/webhooks/:session_id', requireDeviceAccess, asyncHandler(upsertDeviceWebhookController));
router.delete('/webhooks/:session_id', requireDeviceAccess, asyncHandler(deleteDeviceWebhookController));
router.post('/webhooks/:session_id/test', requireDeviceAccess, asyncHandler(testDeviceWebhookController));

router.get('/autoresponder/:session_id', requireDeviceAccess, asyncHandler(getAutoReplyController));
router.put('/autoresponder/:session_id', requireDeviceAccess, asyncHandler(updateAutoReplyController));
router.post(
  '/autoresponder/:session_id/rules',
  requireDeviceAccess,
  asyncHandler(createAutoReplyRuleController),
);
router.patch(
  '/autoresponder/:session_id/rules/:id',
  requireDeviceAccess,
  asyncHandler(updateAutoReplyRuleController),
);
router.delete(
  '/autoresponder/:session_id/rules/:id',
  requireDeviceAccess,
  asyncHandler(deleteAutoReplyRuleController),
);

router.post('/broadcast', requireAdmin, asyncHandler(broadcastController));
router.get('/broadcast/guard', requireAdmin, asyncHandler(broadcastGuardController));
router.get('/broadcast/schedules', requireAdmin, asyncHandler(listScheduledBroadcastController));
router.post('/broadcast/schedules', requireAdmin, asyncHandler(createScheduledBroadcastController));
router.delete('/broadcast/schedules/:id', requireAdmin, asyncHandler(cancelScheduledBroadcastController));

router.get('/admin/users', requireAdmin, asyncHandler(adminListUsersController));
router.post('/admin/users', requireAdmin, asyncHandler(adminCreateUserController));
router.delete('/admin/users/:id', requireAdmin, asyncHandler(adminDeleteUserController));
router.post('/admin/users/:id/api-key', requireAdmin, asyncHandler(adminRegenerateApiKeyController));
router.get('/admin/devices', requireAdmin, asyncHandler(adminListDevicesController));

export default router;
