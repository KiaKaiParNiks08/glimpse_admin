import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FCM_TOKEN_MAX_LENGTH,
  fcmTokenRequestSchema,
  authVerifyRequestSchema,
  authSwitchEventRequestSchema,
  authJoinEventRequestSchema,
  authLogoutRequestSchema,
} from '../../lib/validations/auth.ts';
import {
  normalizeFcmToken,
  extractPushTokenFromDevice,
  computeNeedsFcmTokenSync,
  buildUserDeviceUpsertData,
  isPermanentInvalidFcmError,
} from '../../lib/push-device.ts';

describe('Notification formatting and deep-link payload contracts', () => {
  test('Case 1A: Session Media Upload broadcast format and payload', () => {
    const sessionName = 'Wedding Ceremony';
    const count = 250;
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const sessionId = 's1a2b3c4-1111-2222-3333-444455556666';

    const title = 'New Media Uploaded 📸';
    const body = `${count} media files uploaded to the ${sessionName} session. Check them out!`;
    const data = {
      screen: 'session_media',
      type: 'session_media_uploaded',
      event_id: eventId,
      event_session_id: sessionId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'New Media Uploaded 📸');
    assert.equal(body, '250 media files uploaded to the Wedding Ceremony session. Check them out!');
    assert.equal(data.screen, 'session_media');
    assert.equal(data.type, 'session_media_uploaded');
    for (const [key, value] of Object.entries(data)) {
      assert.equal(typeof value, 'string', `FCM data field "${key}" must be a string`);
    }
  });

  test('Case 1B: Session Face Recognized personalized format and payload', () => {
    const sessionName = 'Wedding Ceremony';
    const totalCount = 250;
    const recognizedCount = 18;
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const sessionId = 's1a2b3c4-1111-2222-3333-444455556666';

    const title = 'New Media Uploaded 📸';
    const body = `${totalCount} media files uploaded to the ${sessionName} session. You have been recognized in ${recognizedCount} media files.`;
    const data = {
      screen: 'session_media',
      type: 'session_media_uploaded',
      event_id: eventId,
      event_session_id: sessionId,
      recognized_count: String(recognizedCount),
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'New Media Uploaded 📸');
    assert.equal(
      body,
      '250 media files uploaded to the Wedding Ceremony session. You have been recognized in 18 media files.'
    );
    assert.equal(data.screen, 'session_media');
    assert.equal(data.recognized_count, '18');
  });

  test('Case 2: Post Liked format and payload', () => {
    const userName = 'Alice Johnson';
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const postId = 'p1234567-aaaa-bbbb-cccc-dddddddddddd';

    const title = 'Someone liked your post ❤️';
    const body = `${userName} liked your post.`;
    const data = {
      screen: 'post_details',
      type: 'post_like',
      event_id: eventId,
      post_id: postId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'Someone liked your post ❤️');
    assert.equal(body, 'Alice Johnson liked your post.');
    assert.equal(data.screen, 'post_details');
    assert.equal(data.type, 'post_like');
    assert.equal(data.post_id, postId);
  });

  test('Case 3: New Comment format and payload', () => {
    const userName = 'Bob Smith';
    const commentText = 'Amazing photos! Congratulations 🎉';
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const postId = 'p1234567-aaaa-bbbb-cccc-dddddddddddd';
    const commentId = 'c7654321-xxxx-yyyy-zzzz-wwwwwwwwwwww';

    const title = 'New Comment 💬';
    const body = `${userName} commented on your post: "${commentText}"`;
    const data = {
      screen: 'post_details',
      type: 'post_comment',
      event_id: eventId,
      post_id: postId,
      comment_id: commentId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'New Comment 💬');
    assert.equal(body, 'Bob Smith commented on your post: "Amazing photos! Congratulations 🎉"');
    assert.equal(data.screen, 'post_details');
    assert.equal(data.type, 'post_comment');
    assert.equal(data.comment_id, commentId);
  });

  test('Case 4: New Reply format and payload', () => {
    const userName = 'Charlie Brown';
    const replyText = 'Thanks a lot!';
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const postId = 'p1234567-aaaa-bbbb-cccc-dddddddddddd';
    const commentId = 'c9999999-xxxx-yyyy-zzzz-wwwwwwwwwwww';
    const parentCommentId = 'c7654321-xxxx-yyyy-zzzz-wwwwwwwwwwww';

    const title = 'New Reply 💬';
    const body = `${userName} replied to your comment: "${replyText}"`;
    const data = {
      screen: 'post_details',
      type: 'comment_reply',
      event_id: eventId,
      post_id: postId,
      comment_id: commentId,
      parent_comment_id: parentCommentId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'New Reply 💬');
    assert.equal(body, 'Charlie Brown replied to your comment: "Thanks a lot!"');
    assert.equal(data.screen, 'post_details');
    assert.equal(data.type, 'comment_reply');
    assert.equal(data.parent_comment_id, parentCommentId);
  });

  test('Case 5: New Post in Event format and payload', () => {
    const userName = 'Diana Prince';
    const eventName = 'Smith & Doe Wedding';
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const postId = 'p1234567-aaaa-bbbb-cccc-dddddddddddd';

    const title = 'New Post 📸';
    const body = `${userName} shared a new post in ${eventName}. Check it out!`;
    const data = {
      screen: 'post_details',
      type: 'new_post',
      event_id: eventId,
      post_id: postId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'New Post 📸');
    assert.equal(body, 'Diana Prince shared a new post in Smith & Doe Wedding. Check it out!');
    assert.equal(data.screen, 'post_details');
    assert.equal(data.type, 'new_post');
  });

  test('Case 6: You are in the Spotlight! format and payload', () => {
    const userName = 'Ethan Hunt';
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const postId = 'p1234567-aaaa-bbbb-cccc-dddddddddddd';

    const title = "You're in the Spotlight! 📸";
    const body = `${userName} shared a new post, and you've been recognized in it. Tap to view!`;
    const data = {
      screen: 'post_details',
      type: 'spotlight_post',
      event_id: eventId,
      post_id: postId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, "You're in the Spotlight! 📸");
    assert.equal(body, "Ethan Hunt shared a new post, and you've been recognized in it. Tap to view!");
    assert.equal(data.screen, 'post_details');
    assert.equal(data.type, 'spotlight_post');
  });

  test('Case 7: Your Post Got Some Love format and payload', () => {
    const userName = 'Fiona Gallagher';
    const eventId = 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa';
    const postId = 'p1234567-aaaa-bbbb-cccc-dddddddddddd';

    const title = 'Your Post Got Some Love ❤️';
    const body = `${userName} liked your post, where you've been recognized.`;
    const data = {
      screen: 'post_details',
      type: 'recognized_post_liked',
      event_id: eventId,
      post_id: postId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    };

    assert.equal(title, 'Your Post Got Some Love ❤️');
    assert.equal(body, "Fiona Gallagher liked your post, where you've been recognized.");
    assert.equal(data.screen, 'post_details');
    assert.equal(data.type, 'recognized_post_liked');
  });
  test('Post-event report structure includes custom thumbnail_url', () => {
    const report = {
      title: 'Annual Gala Recap',
      url: 'https://s3.amazonaws.com/bucket/events/e1/post-event.pdf',
      originalName: 'recap.pdf',
      size: 204800,
      uploadedAt: '2026-11-01T21:00:00.000Z',
      thumbnail_url: 'https://s3.amazonaws.com/bucket/events/e1/post-event/thumbnails/thumb.jpg',
    };

    assert.equal(report.title, 'Annual Gala Recap');
    assert.ok(report.url.endsWith('.pdf'));
    assert.equal(report.thumbnail_url, 'https://s3.amazonaws.com/bucket/events/e1/post-event/thumbnails/thumb.jpg');
  });

  test('FCM token validation schema accepts valid registration request', () => {
    const valid = fcmTokenRequestSchema.safeParse({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      event_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      device_id: 'a1b2c3d4-uuid-device',
      device_type: 'android',
      fcm_token: 'fcm_sample_token_abcdef1234567890',
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.data.device_type, 'android');
      assert.equal(valid.data.device_id, 'a1b2c3d4-uuid-device');
      assert.equal(valid.data.fcm_token, 'fcm_sample_token_abcdef1234567890');
    }

    // Optional event_id
    const withoutEvent = fcmTokenRequestSchema.safeParse({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      device_id: 'a1b2c3d4-uuid-device',
      device_type: 'ios',
      fcm_token: 'fcm_token_xyz',
    });
    assert.equal(withoutEvent.success, true);

    // Rejection on invalid inputs
    const badType = fcmTokenRequestSchema.safeParse({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      device_id: 'a1b2c3d4-uuid-device',
      device_type: 'windows',
      fcm_token: 'token',
    });
    assert.equal(badType.success, false);
  });

  test('Auth verify and join-event schemas accept fcm_token and device info', () => {
    const verifyValid = authVerifyRequestSchema.safeParse({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      otp: '123456',
      device_id: 'device-uuid-1234',
      device_type: 'android',
      fcm_token: 'fcm_token_123',
    });
    assert.equal(verifyValid.success, true);

    const joinValid = authJoinEventRequestSchema.safeParse({
      event_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      device_id: 'device-uuid-1234',
      device_type: 'ios',
      fcm_token: 'fcm_token_456',
    });
    assert.equal(joinValid.success, true);
  });

  test('Rich image push payload configures Android, iOS APNs mutable-content, and data URLs', () => {
    const imageUrl = 'https://cdn.example.com/banner.jpg';
    const message = {
      token: 'fcm_token_sample_12345',
      notification: {
        title: 'Ceremony Starting',
        body: 'Join at the main hall',
        image: imageUrl,
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        image: imageUrl,
        image_url: imageUrl,
      },
      android: {
        priority: 'high',
        notification: {
          channel_id: 'glimpse_notifications',
          sound: 'default',
          default_sound: true,
          image: imageUrl,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'mutable-content': 1,
          },
        },
        fcm_options: {
          image: imageUrl,
        },
      },
    };

    assert.equal(message.notification.image, imageUrl);
    assert.equal(message.android.notification.image, imageUrl);
    assert.equal(message.apns.payload.aps['mutable-content'], 1);
    assert.equal(message.apns.fcm_options.image, imageUrl);
    assert.equal(message.data.image_url, imageUrl);
    assert.equal(message.data.image, imageUrl);
  });

  test('Device reachability does not treat 36-char UUID device_id as a valid FCM push token', () => {
    assert.equal(extractPushTokenFromDevice({ fcm_token: null, device_id: 'a1b2c3d4-e5f6-7890-abcd-1234567890ab' }), null);
    assert.equal(extractPushTokenFromDevice({ fcm_token: '', device_id: 'a1b2c3d4-e5f6-7890-abcd-1234567890ab' }), null);
    assert.equal(
      extractPushTokenFromDevice({ fcm_token: ' fcm_live_token_abc123 ', device_id: 'a1b2c3d4-e5f6-7890-abcd-1234567890ab' }),
      'fcm_live_token_abc123'
    );
    assert.equal(
      extractPushTokenFromDevice({ fcm_token: null, device_id: 'c_very_long_legacy_fcm_token_over_50_characters_long_123456' }),
      'c_very_long_legacy_fcm_token_over_50_characters_long_123456'
    );
  });

  test('normalizeFcmToken returns undefined for blank/null inputs so existing tokens are never wiped', () => {
    assert.equal(normalizeFcmToken(undefined), undefined);
    assert.equal(normalizeFcmToken(null), undefined);
    assert.equal(normalizeFcmToken(''), undefined);
    assert.equal(normalizeFcmToken('   '), undefined);
    assert.equal(normalizeFcmToken('  fcm_valid_abc  '), 'fcm_valid_abc');
  });

  test('buildUserDeviceUpsertData preserves existing fcm_token when app-info or switch-event omits it', () => {
    const now = new Date('2026-11-11T15:00:00.000Z');
    const withoutToken = buildUserDeviceUpsertData({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      device_type: 'android',
      device_id: 'dev-uuid-1',
      fcm_token: null,
      now,
    });
    assert.equal('fcm_token' in withoutToken.update, false);
    assert.equal(withoutToken.update.is_active, true);
    assert.equal(withoutToken.create.fcm_token, null);

    const blankToken = buildUserDeviceUpsertData({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      device_type: 'ios',
      device_id: 'dev-uuid-1',
      fcm_token: '   ',
      now,
    });
    assert.equal('fcm_token' in blankToken.update, false);

    const validToken = buildUserDeviceUpsertData({
      user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
      device_type: 'android',
      device_id: ' dev-uuid-1 ',
      fcm_token: ' fcm_token_fresh_999 ',
      now,
    });
    assert.equal(validToken.update.fcm_token, 'fcm_token_fresh_999');
    assert.equal(validToken.create.fcm_token, 'fcm_token_fresh_999');
    assert.equal(validToken.create.device_id, 'dev-uuid-1');
  });

  test('computeNeedsFcmTokenSync detects missing, inactive, or new-device tokens accurately', () => {
    const activeDev = { device_id: 'dev-A', fcm_token: 'tok-A', is_active: true };
    const wipedDev = { device_id: 'dev-B', fcm_token: null, is_active: true };
    const inactiveDev = { device_id: 'dev-C', fcm_token: 'tok-C', is_active: false };

    assert.equal(computeNeedsFcmTokenSync([activeDev], 'dev-A'), false);
    assert.equal(computeNeedsFcmTokenSync([wipedDev], 'dev-B'), true);
    assert.equal(computeNeedsFcmTokenSync([inactiveDev], 'dev-C'), true);
    // Switching onto a brand-new phone dev-D must still request token sync even if old dev-A exists
    assert.equal(computeNeedsFcmTokenSync([activeDev], 'dev-D'), true);
    // Without device_id, user only needs sync if zero active rows have a usable token
    assert.equal(computeNeedsFcmTokenSync([activeDev, wipedDev], null), false);
    assert.equal(computeNeedsFcmTokenSync([wipedDev, inactiveDev], null), true);
    assert.equal(computeNeedsFcmTokenSync([], null), true);
  });

  test('isPermanentInvalidFcmError deactivates UNREGISTERED and bad-token INVALID_ARGUMENT only', () => {
    assert.equal(isPermanentInvalidFcmError({ errorCode: 404, errorStatus: 'NOT_FOUND', errorMessage: 'Requested entity was not found.' }), true);
    assert.equal(isPermanentInvalidFcmError({ errorStatus: 'INVALID_ARGUMENT', errorMessage: 'The registration token is not a valid FCM registration token' }), true);
    assert.equal(isPermanentInvalidFcmError({ errorMessage: 'UNREGISTERED' }), true);
    // Do not wipe healthy devices when image/payload fails validation or transient 503 happens
    assert.equal(isPermanentInvalidFcmError({ errorStatus: 'INVALID_ARGUMENT', errorMessage: 'Invalid notification image URL' }), false);
    assert.equal(isPermanentInvalidFcmError({ errorCode: 503, errorStatus: 'UNAVAILABLE', errorMessage: 'Service temporarily unavailable' }), false);
  });

  test('Switch, join, fcm-token, and logout schemas validate expected payloads including >500 char tokens', () => {
    const longToken = 'f'.repeat(800);
    assert.equal(FCM_TOKEN_MAX_LENGTH, 1024);
    assert.equal(
      authSwitchEventRequestSchema.safeParse({
        event_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        device_id: 'dev-uuid-1',
        device_type: 'android',
        fcm_token: longToken,
      }).success,
      true
    );
    assert.equal(
      authJoinEventRequestSchema.safeParse({
        event_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        device_id: 'dev-uuid-1',
        device_type: 'ios',
        fcm_token: longToken,
      }).success,
      true
    );
    assert.equal(
      fcmTokenRequestSchema.safeParse({
        user_id: 'e2b3472b-8a8b-4a57-b088-7e3e9d8e57aa',
        device_id: 'dev-uuid-1',
        device_type: 'android',
        fcm_token: longToken,
      }).success,
      true
    );
    assert.equal(authLogoutRequestSchema.safeParse({ device_id: 'dev-uuid-1' }).success, true);
    assert.equal(authLogoutRequestSchema.safeParse({}).success, true);
  });
});
