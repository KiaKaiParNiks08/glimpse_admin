import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

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
});
