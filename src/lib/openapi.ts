/**
 * OpenAPI 3.0 specification for Glimpsapp Admin API.
 * Served at /api/docs/openapi with dynamic server URL.
 */
export function getOpenApiSpec(serverUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Glimpsapp Admin API',
      description:
        'API for Glimpsapp Admin – auth, users, feed (posts with image/video upload, comments, likes), app configurations, CMS pages, events (including session-by-id details), and venues.',
      version: '1.0.0',
    },
    servers: [{ url: serverUrl, description: 'Current server' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        EventSessionDetail: {
          type: 'object',
          description:
            'Single event session with nested day (includes parent event_id), venue, sub-venue, organizer, and offering masters.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            event_day_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            event_organizer_id: { type: 'string', format: 'uuid', nullable: true },
            session_theme: { type: 'string', nullable: true, description: 'Dress code / vibe label' },
            start_time: {
              type: 'string',
              nullable: true,
              pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
              example: '14:32',
              description:
                '24-hour clock HH:mm matching the database TIME (not shifted by API server timezone).',
            },
            end_time: {
              type: 'string',
              nullable: true,
              pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
              example: '18:00',
              description:
                '24-hour clock HH:mm matching the database TIME (not shifted by API server timezone).',
            },
            venue_id: { type: 'string', format: 'uuid', nullable: true },
            venue_subvenue_id: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', nullable: true, example: 'upcoming' },
            created_at: { type: 'string', format: 'date-time', nullable: true },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
            event_session_bg_url: { type: 'string', nullable: true, description: 'Session background image URL' },
            event_day: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                event_id: { type: 'string', format: 'uuid' },
                title: { type: 'string', nullable: true },
                date: { type: 'string', format: 'date' },
              },
            },
            venue: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                address: { type: 'string', nullable: true },
                latitude: { type: 'number', nullable: true },
                longitude: { type: 'number', nullable: true },
                city: { type: 'string', nullable: true },
                state_name: { type: 'string', nullable: true },
                country: { type: 'string', nullable: true },
              },
            },
            venue_subvenue: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                title: { type: 'string' },
              },
            },
            organizer: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                logo_url: { type: 'string', nullable: true },
                contact_email: { type: 'string', nullable: true },
                contact_phone: { type: 'string', nullable: true },
                website_url: { type: 'string', nullable: true },
              },
            },
            offerings: {
              type: 'array',
              description: 'Resolved event_offering_master rows linked to this session.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  description: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths: {
      '/api/admin/refresh': {
        post: {
          summary: 'Refresh admin JWT',
          description:
            'Mints a new admin JWT using the existing admin session (cookie `glimps_admin_session` or Bearer token). Sets the updated cookie and returns the new token in the response body.',
          tags: ['Auth'],
          responses: {
            '200': {
              description: 'Token refreshed',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'object',
                        properties: {
                          token: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '403': { description: 'Not authenticated' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/auth': {
        post: {
          summary: 'Request OTP (login/register)',
          security: [],
          description:
            'Sends OTP for the given mobile and event. Creates guest user if needed and ensures event guest record. Registers or updates the client device via `device_type` and `device_id`. Use event code EVNT1001.',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['country_code', 'mobile_number', 'event_code', 'device_type', 'device_id'],
                  properties: {
                    country_code: { type: 'string', minLength: 1, maxLength: 20, example: '+91' },
                    mobile_number: { type: 'string', minLength: 1, maxLength: 20, example: '9876543210' },
                    event_code: { type: 'string', minLength: 1, maxLength: 20, example: 'EVNT1001', description: 'Event code (use EVNT1001)' },
                    device_type: {
                      type: 'string',
                      enum: ['android', 'ios', 'web'],
                      description: 'Client platform; stored on user_devices.',
                      example: 'android',
                    },
                    device_id: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 255,
                      description: 'Opaque device identifier (e.g. push token or install id).',
                      example: 'fcm-or-install-uuid',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'OTP sent',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string', format: 'uuid' },
                          country_code: { type: 'string', minLength: 1, maxLength: 20, example: '+91' },
                          mobile_number: { type: 'string', minLength: 1, maxLength: 20, example: '9876543210' },
                          event_id: { type: 'string', format: 'uuid' },
                          otp: { type: 'string' },
                          otp_expires_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '403': { description: 'Mobile registered with different role' },
            '404': { description: 'Invalid or unknown event code' },
            '409': { description: 'User or event guest record already exists' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/auth/verify': {
        post: {
          summary: 'Verify OTP',
          security: [],
          description: 'Verifies the OTP for the given user_id.',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id', 'otp'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid' },
                    otp: { type: 'string', minLength: 6, maxLength: 6, pattern: '^\\d{6}$', example: '123456' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'OTP verified',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string', format: 'uuid' },
                          event_id: { type: 'string', format: 'uuid' },
                          token: { type: 'string' },
                          expires_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'JWT expiry time (ISO 8601), matches token exp claim',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid or expired OTP' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/auth/resend': {
        post: {
          summary: 'Resend OTP',
          security: [],
          description: 'Generates and returns a new OTP for the given user.',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'OTP resent',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string', format: 'uuid' },
                          otp: { type: 'string' },
                          otp_expires_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': { description: 'User not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          summary: 'Refresh user JWT (mobile)',
          description:
            'Re-issues a new app-user JWT using the current valid Bearer JWT. If the provided token is expired/invalid, the client must restart the OTP flow.',
          tags: ['Auth'],
          responses: {
            '200': {
              description: 'Token refreshed',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string', format: 'uuid' },
                          event_id: { type: 'string', format: 'uuid' },
                          token: { type: 'string' },
                          expires_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '403': { description: 'Not authenticated' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/users': {
        get: {
          summary: 'List admins',
          description: 'Paginated list of admins with optional search and filters.',
          tags: ['Admins'],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or email' },
            { name: 'is_active', in: 'query', schema: { type: 'boolean' } },
            { name: 'role_id', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              description: 'Paginated users',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            full_name: { type: 'string' },
                            email: { type: 'string' },
                            role_id: { type: 'integer' },
                            is_active: { type: 'boolean' },
                            created_at: { type: 'string', format: 'date-time' },
                            avatar_url: { type: 'string', nullable: true },
                            mobile_number: { type: 'string', nullable: true },
                            country_code: { type: 'string', nullable: true },
                          },
                        },
                      },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
        post: {
          summary: 'Create user',
          description: 'Creates a new admin/user. Password is hashed on the server.',
          tags: ['Users'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['full_name', 'email', 'password', 'role_id'],
                  properties: {
                    full_name: { type: 'string', minLength: 1, maxLength: 100 },
                    email: { type: 'string', format: 'email', maxLength: 150 },
                    password: { type: 'string', minLength: 8 },
                    role_id: { type: 'integer', minimum: 1 },
                    country_code: { type: 'string', maxLength: 100 },
                    mobile_number: { type: 'string', maxLength: 20 },
                    is_active: { type: 'boolean', default: true },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'User created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      full_name: { type: 'string' },
                      email: { type: 'string' },
                      role_id: { type: 'integer' },
                      is_active: { type: 'boolean' },
                      created_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '409': { description: 'Email already exists' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/favorites': {
        get: {
          summary: "List a user's favorites in an event",
          description:
            'Gallery media (event day media) and feed posts the user added to favorites for this event, newest first. Favorites of deleted posts are hidden. Each item has either `media` (item_type=day_media) or `post` (item_type=post) filled; the other is null.',
          tags: ['Favorites'],
          parameters: [
            { name: 'user_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'type',
              in: 'query',
              schema: { type: 'string', enum: ['all', 'day_media', 'post'], default: 'all' },
            },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Paginated favorites',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            favorite_id: { type: 'string', format: 'uuid' },
                            item_type: { type: 'string', enum: ['day_media', 'post'] },
                            item_id: { type: 'string', format: 'uuid' },
                            favorited_at: { type: 'string', format: 'date-time', nullable: true },
                            media: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                event_day_id: { type: 'string', format: 'uuid' },
                                media_url: { type: 'string' },
                                media_type: { type: 'string', enum: ['image', 'video'] },
                                display_order: { type: 'integer', nullable: true },
                                created_at: { type: 'string', format: 'date-time', nullable: true },
                                day: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    title: { type: 'string', nullable: true },
                                    date: { type: 'string', format: 'date-time' },
                                  },
                                },
                                is_favorite: { type: 'boolean', example: true },
                              },
                            },
                            post: {
                              type: 'object',
                              nullable: true,
                              description:
                                'Same shape as a GET /api/feed item, plus liked_by_viewer and is_favorite (always true here)',
                            },
                          },
                        },
                      },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Validation failed' },
            '403': { description: 'User is not a guest of this event' },
            '500': { description: 'Server error' },
          },
        },
        post: {
          summary: 'Add or remove a favorite',
          description:
            'Adds (`add_favourite: true`) or removes (`add_favourite: false`) a gallery media item (day_media) or a feed post (post) from the user\'s favorites for this event. Nothing is re-uploaded; only a mapping row is stored. Day media must belong to the given event. Adding an existing favorite or removing a missing one is a no-op.',
          tags: ['Favorites'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id', 'event_id', 'item_type', 'item_id', 'add_favourite'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid' },
                    event_id: { type: 'string', format: 'uuid' },
                    item_type: { type: 'string', enum: ['day_media', 'post'] },
                    item_id: {
                      type: 'string',
                      format: 'uuid',
                      description: 'event_day_media.id for day_media, posts.id for post',
                    },
                    add_favourite: {
                      type: 'boolean',
                      description: 'true = add to favourites, false = remove from favourites',
                      example: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Current favorite state',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'object',
                        properties: {
                          is_favorite: { type: 'boolean' },
                          item_type: { type: 'string', enum: ['day_media', 'post'] },
                          item_id: { type: 'string', format: 'uuid' },
                          event_id: { type: 'string', format: 'uuid' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Validation failed' },
            '403': { description: 'User is not a guest of this event' },
            '404': { description: 'Post not found / media not found in this event' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/feed': {
        get: {
          summary: 'List feed posts',
          description:
            'Paginated feed posts. When event_id is set, only posts stored for that event are returned. Posts with no event_id are left out of every event feed.',
          tags: ['Feed'],
          parameters: [
            { name: 'user_id', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by post author' },
            {
              name: 'viewer_user_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description: 'When provided, each post includes liked_by_viewer=true/false for this user',
            },
            {
              name: 'event_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description:
                'Return only posts for this event. Also, with viewer_user_id, each post includes is_favorite for this event.',
            },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'deleted'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Paginated feed posts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            user_id: { type: 'string', format: 'uuid' },
                            event_id: { type: 'string', format: 'uuid', nullable: true },
                            caption: { type: 'string', nullable: true },
                            status: { type: 'string', nullable: true },
                            like_count: { type: 'integer', nullable: true },
                            comment_count: { type: 'integer', nullable: true },
                            liked_by_viewer: {
                              type: 'boolean',
                              nullable: true,
                              description: 'Present only when viewer_user_id is provided in query',
                            },
                            is_favorite: {
                              type: 'boolean',
                              description: 'Present only when viewer_user_id and event_id are provided in query',
                            },
                            created_at: { type: 'string', format: 'date-time', nullable: true },
                            updated_at: { type: 'string', format: 'date-time', nullable: true },
                            users: {
                              type: 'object',
                              properties: {
                                full_name: { type: 'string' },
                                avatar_url: { type: 'string', nullable: true },
                              },
                              description: 'Post author',
                            },
                            post_media: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  media_type: { type: 'string', enum: ['image', 'video'] },
                                  media_url: {
                                    type: 'string',
                                    description:
                                      'Stored media URL (CloudFront public URL if configured, otherwise /api/upload/signed?t=...).',
                                  },
                                  thumbnail_url: { type: 'string', nullable: true },
                                  media_order: { type: 'integer', nullable: true },
                                },
                              },
                            },
                          },
                        },
                      },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
        post: {
          summary: 'Create feed post (with optional image/video upload)',
          description:
            'Creates a feed post. Use multipart/form-data. Media: either max 1 video OR max 6 images (no mixing). Files are uploaded to S3 and returned as a stored URL (CloudFront public URL if configured, otherwise /api/upload/signed?t=...). Allowed: images (JPEG, PNG, GIF, WebP), videos (MP4, WebM, MOV). Size limits: images max 10MB, videos max 50MB; videos max 120 seconds (provide `video_duration_sec` from client-side metadata). Empty files rejected.',
          tags: ['Feed'],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['user_id'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid', description: 'Post author (required)' },
                    event_id: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Event this post belongs to. Omit to keep it out of every event feed.',
                    },
                    caption: { type: 'string', description: 'Post caption' },
                    video_duration_sec: {
                      type: 'number',
                      format: 'float',
                      description:
                        'Required when uploading a video: duration in seconds from file metadata (e.g. HTML video element). Must be greater than 0 and at most 120. Omit when posting images only.',
                    },
                    media: {
                      type: 'array',
                      items: { type: 'string', format: 'binary' },
                      description:
                        'Image(s) or video. Max 1 video OR max 6 images (no mixing). Allowed: JPEG, PNG, GIF, WebP; MP4, WebM, MOV. Size: images max 10MB, videos max 50MB; video length max 120s (see video_duration_sec).',
                    },
                  },
                },
                encoding: {
                  media: {
                    contentType: 'image/jpeg, image/png, image/gif, image/webp, video/mp4, video/webm, video/quicktime',
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Post created with media',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      user_id: { type: 'string', format: 'uuid' },
                      caption: { type: 'string', nullable: true },
                      status: { type: 'string', nullable: true },
                      like_count: { type: 'integer', nullable: true },
                      comment_count: { type: 'integer', nullable: true },
                      created_at: { type: 'string', format: 'date-time', nullable: true },
                      updated_at: { type: 'string', format: 'date-time', nullable: true },
                      users: {
                        type: 'object',
                        properties: {
                          full_name: { type: 'string' },
                          avatar_url: { type: 'string', nullable: true },
                        },
                        description: 'Post author',
                      },
                      post_media: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            media_type: { type: 'string', enum: ['image', 'video'] },
                            media_url: { type: 'string' },
                            thumbnail_url: { type: 'string', nullable: true },
                            media_order: { type: 'integer', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string' },
                      details: { type: 'object', description: 'Optional field-level errors' },
                    },
                  },
                  examples: {
                    validation: { summary: 'Invalid form fields', value: { error: 'Validation failed', details: { user_id: ['Invalid uuid'] } } },
                    fileType: { summary: 'Invalid file type', value: { error: 'Invalid image type: application/pdf. Allowed: image/jpeg, image/png, ...' } },
                    fileSize: { summary: 'File too large', value: { error: 'image file too large. Maximum size: 10MB.' } },
                    fileEmpty: { summary: 'Empty file', value: { error: 'image file is too small or empty.' } },
                    maxVideo: { summary: 'Too many videos', value: { error: 'Maximum 1 video allowed per post.' } },
                    maxImages: { summary: 'Too many images', value: { error: 'Maximum 6 images allowed per post.' } },
                    mixed: { summary: 'Video and images mixed', value: { error: 'Post must contain either a single video or up to 6 images, not both.' } },
                    videoDuration: {
                      summary: 'Video too long or duration missing',
                      value: { error: 'Video must be at most 120 seconds.' },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/feed/{post_id}': {
        get: {
          summary: 'List users who liked a post',
          description: 'Returns users who liked the specified post, newest likes first.',
          tags: ['Feed'],
          parameters: [
            { name: 'post_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Liked users list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            like_id: { type: 'string', format: 'uuid' },
                            user_id: { type: 'string', format: 'uuid' },
                            full_name: { type: 'string' },
                            avatar_url: { type: 'string', nullable: true },
                          },
                          required: ['like_id', 'user_id', 'full_name'],
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': { description: 'Post not found' },
            '400': { description: 'Validation failed' },
            '500': { description: 'Server error' },
          },
        },
        delete: {
          summary: 'Delete feed post (self-owned)',
          description: 'Soft-deletes a feed post. Only the post owner (user_id) can delete it.',
          tags: ['Feed'],
          parameters: [
            { name: 'post_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid', description: 'Post owner user id' },
                  },
                },
              },
            },
          },
          responses: {
            '204': { description: 'Post deleted (no content)' },
            '403': { description: 'Forbidden (not the post owner)' },
            '404': { description: 'Post not found' },
            '400': { description: 'Validation failed' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/feed/{post_id}/comments': {
        get: {
          summary: 'List post comments',
          description:
            'Paginated top-level comments for a post, newest first. Each comment includes a replies array (oldest first) for that thread, including a reply to a reply. meta.total counts top-level comments only.',
          tags: ['Feed'],
          parameters: [
            { name: 'post_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Post ID' },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'deleted'] }, description: 'Filter by comment status' },
            {
              name: 'parent_comment_id',
              in: 'query',
              schema: { type: 'string', enum: ['root', 'all'] },
              description: 'Accepted for older clients. Replies are always nested; this value does not change the list.',
            },
          ],
          responses: {
            '200': {
              description: 'Paginated comments',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            post_id: { type: 'string', format: 'uuid' },
                            user_id: { type: 'string', format: 'uuid' },
                            parent_comment_id: { type: 'string', format: 'uuid', nullable: true },
                            comment_text: { type: 'string' },
                            status: { type: 'string', nullable: true },
                            created_at: { type: 'string', format: 'date-time', nullable: true },
                            updated_at: { type: 'string', format: 'date-time', nullable: true },
                            users: {
                              type: 'object',
                              properties: {
                                full_name: { type: 'string' },
                                avatar_url: { type: 'string', nullable: true },
                              },
                              description: 'Comment author',
                            },
                            replies: {
                              type: 'array',
                              description: 'Replies on this comment, oldest first. Same fields as a comment, without a nested replies array.',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  post_id: { type: 'string', format: 'uuid' },
                                  user_id: { type: 'string', format: 'uuid' },
                                  parent_comment_id: { type: 'string', format: 'uuid', nullable: true },
                                  comment_text: { type: 'string' },
                                  status: { type: 'string', nullable: true },
                                  created_at: { type: 'string', format: 'date-time', nullable: true },
                                  updated_at: { type: 'string', format: 'date-time', nullable: true },
                                  users: {
                                    type: 'object',
                                    properties: {
                                      full_name: { type: 'string' },
                                      avatar_url: { type: 'string', nullable: true },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': { description: 'Post not found' },
            '500': { description: 'Server error' },
          },
        },
        post: {
          summary: 'Add comment on post',
          description:
            'Creates a comment on a post. Optionally set parent_comment_id to reply to an existing comment. Post comment_count is incremented.',
          tags: ['Feed'],
          parameters: [
            { name: 'post_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Post ID' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id', 'comment_text'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid', description: 'Comment author' },
                    comment_text: { type: 'string', minLength: 1, maxLength: 2000, description: 'Comment content' },
                    parent_comment_id: { type: 'string', format: 'uuid', description: 'Optional; reply to this comment' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Comment created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      post_id: { type: 'string', format: 'uuid' },
                      user_id: { type: 'string', format: 'uuid' },
                      parent_comment_id: { type: 'string', format: 'uuid', nullable: true },
                      comment_text: { type: 'string' },
                      status: { type: 'string', nullable: true },
                      created_at: { type: 'string', format: 'date-time', nullable: true },
                      updated_at: { type: 'string', format: 'date-time', nullable: true },
                      users: {
                        type: 'object',
                        properties: {
                          full_name: { type: 'string' },
                          avatar_url: { type: 'string', nullable: true },
                        },
                        description: 'Comment author',
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Validation failed' },
            '404': { description: 'Post not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/feed/{post_id}/comments/{comment_id}': {
        delete: {
          summary: 'Delete comment (self-owned)',
          description:
            'Soft-deletes a comment for a post. Only the comment owner (user_id) can delete it. Post comment_count is decremented.',
          tags: ['Feed'],
          parameters: [
            { name: 'post_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'comment_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid', description: 'Comment owner user id' },
                  },
                },
              },
            },
          },
          responses: {
            '204': { description: 'Comment deleted (no content)' },
            '403': { description: 'Forbidden (not the comment owner)' },
            '404': { description: 'Comment not found' },
            '400': { description: 'Validation failed' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/feed/{post_id}/like': {
        post: {
          summary: 'Like/Unlike a post',
          description:
            'Likes/unlikes a post for the given user. Use action=toggle (default) to flip state, or action=like/action=unlike to enforce a state. Returns current liked status and updated like_count.',
          tags: ['Feed'],
          parameters: [
            { name: 'post_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Post ID' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['user_id'],
                  properties: {
                    user_id: { type: 'string', format: 'uuid', description: 'User who is liking the post' },
                    action: { type: 'string', enum: ['toggle', 'like', 'unlike'], default: 'toggle' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Like status updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      liked: { type: 'boolean' },
                      like_count: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '404': { description: 'Post not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/team': {
        get: {
          summary: 'Get event planner and photographer',
          description:
            'Returns the single event planner and photographer saved for an event. A side is null when it has not been filled in.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Planner and photographer',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          planner: { type: 'object', nullable: true },
                          photographer: { type: 'object', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': { description: 'Event not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/highlights': {
        get: {
          summary: 'List event highlights',
          description: 'Returns event highlights for the given event_id.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'List of highlights',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { type: 'object', description: 'Event highlight record' },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/current-happening': {
        get: {
          summary: 'List current happening',
          description:
            'Returns current happening rows for the given event_id. Note: photo details are intentionally excluded; use /api/events/current-happening/photos for images.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'List of current happening rows',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            event_id: { type: 'string', format: 'uuid' },
                            title: { type: 'string' },
                            description: { type: 'string', nullable: true },
                            bg_image_url: { type: 'string' },
                            happening_date: { type: 'string', format: 'date' },
                            is_active: { type: 'boolean', nullable: true },
                            display_order: { type: 'integer', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/current-happening/photos': {
        get: {
          summary: 'List current happening gallery media',
          description:
            'Returns gallery media (images and videos) for a given current happening (happening_id). Use `media_type` to distinguish image vs video.',
          tags: ['Events'],
          parameters: [
            { name: 'happening_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'List of happening gallery items (images and videos)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            happening_id: { type: 'string', format: 'uuid' },
                            image_url: {
                              type: 'string',
                              description: 'Media URL (image or video)',
                            },
                            media_type: {
                              type: 'string',
                              enum: ['image', 'video'],
                              description: 'How clients should render the URL',
                            },
                            alt_text: { type: 'string', nullable: true },
                            sort_order: { type: 'integer', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/day-media': {
        get: {
          summary: 'List gallery media of a session or a day',
          description:
            'Returns gallery media rows of one session (event_session_id, preferred) or of a whole day (event_day_id, every session of that day). One of the two is required. ' +
            'The event watermark to draw over images is returned by GET /api/events/{event_id} (`watermark`).',
          tags: ['Events'],
          parameters: [
            { name: 'event_session_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
            { name: 'event_day_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'viewer_user_id',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
              description: 'When provided, each item includes is_favorite=true/false for this user',
            },
          ],
          responses: {
            '200': {
              description: 'List of event day media',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            event_day_id: { type: 'string', format: 'uuid' },
                            event_session_id: {
                              type: 'string',
                              format: 'uuid',
                              nullable: true,
                              description: 'Null only for older day-wise uploads with no session',
                            },
                            media_url: { type: 'string' },
                            media_type: { type: 'string', enum: ['image', 'video'] },
                            display_order: { type: 'integer', nullable: true },
                            created_at: { type: 'string', format: 'date-time', nullable: true },
                            is_favorite: {
                              type: 'boolean',
                              description: 'Present only when viewer_user_id is provided in query',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid query params (event_session_id or event_day_id is required)' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/users/{user_id}': {
        get: {
          summary: 'Get user by ID',
          description:
            'Returns user details for the given user_id (UUID). Excludes password_hash. Optional query event_id can be passed to resolve e_invite_pdf_url for that event when the user role is "user". For role "user", when the resolved event category is wedding, `wedding_side` and `can_edit_wedding_side` are included for profile UI.',
          tags: ['Users'],
          parameters: [
            { name: 'user_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'event_id',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'uuid' },
              description:
                'Optional event context. If provided (and target user is role "user"), e_invite_pdf_url is resolved for this event. If omitted, latest joined event is used.',
            },
          ],
          responses: {
            '200': {
              description: 'User details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          full_name: { type: 'string' },
                          email: { type: 'string', nullable: true },
                          role_id: { type: 'integer' },
                          is_active: { type: 'boolean' },
                          created_at: { type: 'string', format: 'date-time' },
                          avatar_url: { type: 'string', nullable: true },
                          mobile_number: { type: 'string', nullable: true },
                          country_code: { type: 'string', nullable: true },
                          instagram_id: { type: 'string', nullable: true },
                          e_invite_pdf_url: {
                            type: 'string',
                            nullable: true,
                            description:
                              'Present for role "user". Event invitation PDF URL resolved by event_id query (if provided) or user latest joined event.',
                          },
                          wedding_side: {
                            type: 'string',
                            enum: ['groom', 'bride'],
                            nullable: true,
                            description:
                              'Present for role "user" when the resolved event is a wedding. Stored on event_guests.',
                          },
                          can_edit_wedding_side: {
                            type: 'boolean',
                            description:
                              'Present for role "user". True when the resolved event category is wedding (client may show Groom/Bride picker).',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': { description: 'User not found' },
            '500': { description: 'Server error' },
          },
        },
        patch: {
          summary: 'Update user',
          description:
            'Updates user profile. Only provided fields are updated. Password is hashed if sent. Optional `wedding_side` with `event_id` updates Groom/Bride for that event when its category is wedding; app user JWT must match this user_id and event_id.',
          tags: ['Users'],
          parameters: [
            { name: 'user_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    full_name: { type: 'string', minLength: 1, maxLength: 100 },
                    email: { type: 'string', format: 'email', maxLength: 150 },
                    password: { type: 'string', minLength: 8 },
                    role_id: { type: 'integer', minimum: 1 },
                    country_code: { type: 'string', maxLength: 100 },
                    mobile_number: { type: 'string', maxLength: 20 },
                    is_active: { type: 'boolean' },
                    avatar_url: { type: 'string', format: 'uri', nullable: true },
                    instagram_id: { type: 'string', maxLength: 100, nullable: true },
                    event_id: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Required when `wedding_side` is sent.',
                    },
                    wedding_side: {
                      type: 'string',
                      enum: ['groom', 'bride'],
                      nullable: true,
                      description:
                        'Groom or Bride for a wedding event. Send null to clear. Requires `event_id`.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'User updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'object', description: 'Updated user (no password)' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid wedding_side / event (e.g. not a wedding category)' },
            '403': { description: 'Forbidden (e.g. app user cannot set side for another event)' },
            '404': { description: 'User not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/users/{user_id}/profile-picture': {
        post: {
          summary: 'Upload user profile picture',
          description:
            'Uploads a single image and updates only the user avatar_url. Body must be multipart/form-data with field `file`.',
          tags: ['Users'],
          parameters: [
            { name: 'user_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'Profile image file (JPEG, PNG, GIF, WebP). Max 10MB.',
                    },
                  },
                },
                encoding: {
                  file: {
                    contentType: 'image/jpeg, image/png, image/gif, image/webp',
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Profile picture uploaded and user updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Profile picture updated' },
                      data: {
                        type: 'object',
                        properties: {
                          user_id: { type: 'string', format: 'uuid' },
                          avatar_url: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid or missing file' },
            '404': { description: 'User not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/app-configurations': {
        get: {
          summary: 'List app configurations',
          description:
            'Returns a paginated list of app configurations. Requires admin Bearer JWT; only the super_admin role may call this endpoint.',
          tags: ['App configurations'],
          parameters: [
            { name: 'platform', in: 'query', schema: { type: 'string', maxLength: 20 } },
            { name: 'is_active', in: 'query', schema: { type: 'boolean' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Paginated app configurations',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/app-info': {
        get: {
          summary: 'Get app info for event and user',
          description:
            'Returns event app theme colors and app configuration rows for client update checks.',
          tags: ['App configurations'],
          parameters: [
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'user_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'platform',
              in: 'query',
              required: false,
              schema: { type: 'string', maxLength: 20 },
              description: 'Optional platform filter (e.g. android, ios, web).',
            },
          ],
          responses: {
            '200': {
              description: 'App info payload',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: {
                        type: 'object',
                        properties: {
                          primary_color: { type: 'string', nullable: true, example: '#0F172A' },
                          secondary_color: { type: 'string', nullable: true, example: '#F97316' },
                          button_primary_color: { type: 'string', nullable: true, example: '#4338CA' },
                          button_secondary_color: { type: 'string', nullable: true, example: '#0369A1' },
                          event_status: {
                            type: 'string',
                            nullable: true,
                            example: 'published',
                            description: 'Current event status from events.status',
                          },
                          app_configurations: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                platform: { type: 'string', example: 'android' },
                                store_url: { type: 'string', example: 'https://play.google.com/store/apps/details?id=com.example.app' },
                                current_version: { type: 'string', nullable: true, example: '1.2.0' },
                                force_update: { type: 'boolean', nullable: true, example: false },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid query params' },
            '404': { description: 'Event or user not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/cms-pages': {
        get: {
          summary: 'List CMS pages',
          description: 'Returns a paginated list of CMS pages.',
          tags: ['CMS'],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Paginated CMS pages',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/{event_id}': {
        get: {
          summary: 'Get event by ID (mobile dashboard: phase, sessions, session-wise media, section settings)',
          description:
            'Returns full event details for the given event_id (UUID), plus `phase`, `event_sessions`, `media_sections` and, when they ' +
            'have data, `watermark`, `current_happening` and `post_event_report`. ' +
            'The phase is computed from the event `start_date` / `end_date` in the event timezone (default Asia/Kolkata): ' +
            '`pre` before the start date, `ongoing` from start to end date (inclusive), `post` after the end date. ' +
            '`event_sessions` contains all sessions of the event, sorted by day then start time. ' +
            '`media_sections` starts with "All media" (key `all`: every gallery item of the event, no session filter), followed by one ' +
            'section per session in `event_sessions` with the media uploaded for that session. The same title can appear on several days; use `date`. ' +
            '`watermark` (omitted when not set) should be drawn over images as a square of `size` x `size` pixels of the actual image ' +
            '(max 120; scale with the displayed size), margin_percent of the image width from the edges, at `opacity`%. ' +
            '`current_happening` is present only when the event has happening items and the admin enabled the section for the current phase; ' +
            '`post_event_report` only when a PDF is uploaded and the admin enabled it for the current phase. When present, show them. ' +
            'The raw `post_event_pdf_*` columns are not returned; use `post_event_report`. ' +
            'Admin tokens may pass `phase` to preview another phase.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'phase',
              in: 'query',
              required: false,
              description: 'Admin tokens only: preview the response for this phase. Ignored for other tokens.',
              schema: { type: 'string', enum: ['pre', 'ongoing', 'post'] },
            },
            {
              name: 'viewer_user_id',
              in: 'query',
              required: false,
              description: 'When provided, each media item includes is_favorite=true/false for this user',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Event details with current phase, sessions, media and section settings',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      data: {
                        type: 'object',
                        description:
                          'Full event record plus `phase`, `event_sessions`, `watermark`, `media_sections`, `current_happening` and `post_event_report`',
                        properties: {
                          cover_image: {
                            type: 'string',
                            nullable: true,
                            description: 'Main cover image (same as cover_images[0])',
                          },
                          cover_images: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'All cover image URLs in the order set by the admin (first = main cover)',
                          },
                          linkedin_url: {
                            type: 'string',
                            nullable: true,
                            example: 'https://www.linkedin.com/company/acme',
                            description: 'LinkedIn page; always set for corporate events, usually null otherwise',
                          },
                          phase: {
                            type: 'object',
                            properties: {
                              current: { type: 'string', enum: ['pre', 'ongoing', 'post'] },
                              is_preview: { type: 'boolean' },
                              today: { type: 'string', format: 'date', example: '2026-09-28' },
                              timezone: { type: 'string', example: 'Asia/Kolkata' },
                            },
                          },
                          event_sessions: {
                            type: 'array',
                            description:
                              'Same session shape as GET /api/events/{event_id}/days (venue, sub-venue, organizer, offerings), plus `date` and `event_day`',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                event_day_id: { type: 'string', format: 'uuid' },
                                title: { type: 'string', example: 'Haldi' },
                                description: { type: 'string', nullable: true },
                                start_time: { type: 'string', nullable: true, example: '10:00' },
                                end_time: { type: 'string', nullable: true, example: '13:00' },
                                session_theme: { type: 'string', nullable: true },
                                event_session_bg_url: { type: 'string', nullable: true },
                                date: { type: 'string', format: 'date-time' },
                                event_day: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    title: { type: 'string', nullable: true },
                                    date: { type: 'string', format: 'date-time' },
                                  },
                                },
                                media_count: { type: 'integer', description: 'Gallery items uploaded for this session' },
                              },
                            },
                          },
                          watermark: {
                            type: 'object',
                            description: 'Omitted when no watermark is set',
                            properties: {
                              url: { type: 'string' },
                              position: {
                                type: 'string',
                                enum: ['top_left', 'top_right', 'center', 'bottom_left', 'bottom_right'],
                              },
                              opacity: { type: 'integer', minimum: 0, maximum: 100, example: 70 },
                              size: {
                                type: 'integer',
                                minimum: 16,
                                maximum: 120,
                                example: 48,
                                description: 'Side of the square watermark in actual image pixels',
                              },
                              margin_percent: { type: 'integer', example: 3 },
                            },
                          },
                          media_sections: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                key: { type: 'string', description: '`all` for All media, otherwise the session id' },
                                title: { type: 'string', example: 'Haldi' },
                                event_session_id: { type: 'string', format: 'uuid', nullable: true },
                                date: { type: 'string', format: 'date-time', nullable: true },
                                start_time: { type: 'string', nullable: true, example: '10:00' },
                                media_count: { type: 'integer' },
                                media: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      id: { type: 'string', format: 'uuid' },
                                      event_day_id: { type: 'string', format: 'uuid' },
                                      event_session_id: { type: 'string', format: 'uuid', nullable: true },
                                      media_url: { type: 'string' },
                                      media_type: { type: 'string', enum: ['image', 'video'] },
                                      display_order: { type: 'integer', nullable: true },
                                      created_at: { type: 'string', format: 'date-time', nullable: true },
                                      is_favorite: {
                                        type: 'boolean',
                                        description: 'Present only when viewer_user_id is provided',
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          current_happening: {
                            type: 'object',
                            description:
                              'Omitted when there are no items or the section is not enabled for phase.current. ' +
                              'Photos per item: GET /api/events/current-happening/photos',
                            properties: {
                              title: { type: 'string', example: 'Current Happening', description: 'Section title set by the admin' },
                              items: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    event_id: { type: 'string', format: 'uuid' },
                                    title: { type: 'string' },
                                    description: { type: 'string', nullable: true },
                                    bg_image_url: { type: 'string' },
                                    happening_date: { type: 'string', format: 'date-time' },
                                    is_active: { type: 'boolean', nullable: true },
                                    display_order: { type: 'integer', nullable: true },
                                  },
                                },
                              },
                            },
                          },
                          post_event_report: {
                            type: 'object',
                            description: 'Omitted when no PDF is uploaded or the report is not enabled for phase.current',
                            properties: {
                              title: { type: 'string', example: 'Post-event report', description: 'Report title set by the admin' },
                              url: { type: 'string' },
                              original_name: { type: 'string', nullable: true },
                              size: { type: 'integer', nullable: true, description: 'Bytes' },
                              uploaded_at: { type: 'string', format: 'date-time', nullable: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid event_id, phase or viewer_user_id' },
            '404': { description: 'Event not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/{event_id}/days': {
        get: {
          summary: 'List event days',
          description:
            'Returns event days for the given event_id. Optional query: date (exact), start_date and end_date (range). Each session includes `start_time` and `end_time` as strings in 24-hour `HH:mm` form (e.g. "14:32"), or null when unset.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            '200': {
              description: 'List of event days',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '404': { description: 'Event not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/sessions/{session_id}': {
        get: {
          summary: 'Get event session by ID',
          description:
            'Returns one `event_sessions` row by UUID with `event_day` (includes `event_id`), `venue`, `venue_subvenue`, `organizer`, and `offerings` (resolved from `event_offering_master`). `start_time` and `end_time` are strings in 24-hour `HH:mm` form (e.g. "14:32"), or null. Standard envelope: `{ message, data }` where `data` is the session object.',
          tags: ['Events'],
          parameters: [
            {
              name: 'session_id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'Primary key of `event_sessions`.',
            },
          ],
          responses: {
            '200': {
              description: 'Session details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Success' },
                      data: { $ref: '#/components/schemas/EventSessionDetail' },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Invalid path params (e.g. session_id is not a UUID)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      data: { type: 'object', nullable: true },
                    },
                  },
                },
              },
            },
            '404': { description: 'Session not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/admin/events/{event_id}/guests/export': {
        get: {
          summary: 'Export event guests CSV (super admin)',
          description:
            'Returns a UTF-8 CSV of app users registered as guests for the event: full name, mobile number (country code + number when present), Instagram ID, Is verified (non-expired verified OTP, same rule as user profile API), Is active, and for wedding-category events a Wedding side column (Groom side / Bride side). Requires admin Bearer JWT; only super_admin may call.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'CSV attachment',
              content: {
                'text/csv': { schema: { type: 'string', format: 'binary' } },
              },
            },
            '400': { description: 'Invalid event id' },
            '403': { description: 'Not authenticated or not super_admin' },
            '404': { description: 'Event not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/admin/events/{event_id}/days/{event_day_id}/media': {
        post: {
          summary: 'Create session media (admin)',
          description:
            'Creates one or more gallery media rows for a session of this event day (event_session_id is required and must belong to the day). Intended to be used after uploading files to S3 and obtaining media_key/media_url.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'event_day_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['event_session_id', 'items'],
                  properties: {
                    event_session_id: { type: 'string', format: 'uuid', description: 'Session of this day' },
                    items: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 50,
                      items: {
                        type: 'object',
                        required: ['media_key', 'media_url', 'media_type'],
                        properties: {
                          media_key: {
                            type: 'string',
                            maxLength: 1024,
                            description: 'S3 object key (e.g. events/<eventId>/sessions/<sessionId>/...).',
                          },
                          media_url: {
                            type: 'string',
                            maxLength: 2000,
                            description: 'Stored media URL (CloudFront URL or /api/upload/signed?t=...).',
                          },
                          media_type: { type: 'string', enum: ['image', 'video'] },
                          display_order: { type: 'integer', minimum: 0 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Media rows created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            event_day_id: { type: 'string', format: 'uuid' },
                            media_key: { type: 'string', nullable: true },
                            media_url: { type: 'string' },
                            media_type: { type: 'string', enum: ['image', 'video'] },
                            display_order: { type: 'integer', nullable: true },
                            created_at: { type: 'string', format: 'date-time', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid request body or ids' },
            '403': { description: 'Not authenticated' },
            '404': { description: 'Event or event day not found / forbidden for event_admin' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/admin/events/{event_id}/days/{event_day_id}/media/{media_id}': {
        delete: {
          summary: 'Delete event day media (admin)',
          description:
            'Deletes the event day media row and its underlying S3 object (by media_key when available).',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'event_day_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'media_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Media deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'object', additionalProperties: false },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid path ids' },
            '403': { description: 'Not authenticated' },
            '404': { description: 'Event/media not found / forbidden for event_admin' },
            '500': { description: 'Server error (including S3 delete failure)' },
          },
        },
      },
      '/api/events/explore-categories': {
        get: {
          summary: 'List event explore categories',
          description:
            'Returns distinct explore category names (before-event) for the given event. Categories from event_explore_items → explore_items → explore_categories.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'List of category names',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/events/explore-items': {
        get: {
          summary: 'List explore items',
          description: 'Returns explore item list for the given event and explore category.',
          tags: ['Events'],
          parameters: [
            { name: 'event_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'explore_category_id',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'List of explore items',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/venues/venueDetailById': {
        get: {
          summary: 'Get venue details by ID (query)',
          description:
            'Returns full venue details. Required query venue_id. Optional query user_id: when provided, venue_contacts contains only the contact assigned to this user via event_guests.',
          tags: ['Venues'],
          parameters: [
            { name: 'venue_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'user_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Venue details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'object', description: 'Venue with optional filtered venue_contacts' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid query params' },
            '404': { description: 'Venue not found' },
            '500': { description: 'Server error' },
          },
        },
        patch: {
          summary: 'Update venue (query)',
          description: 'Updates a venue. Required query venue_id.',
          tags: ['Venues'],
          parameters: [{ name: 'venue_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', description: 'Same shape as create venue; all fields optional.' },
              },
            },
          },
          responses: {
            '200': { description: 'Venue updated' },
            '400': { description: 'Validation error / invalid query params' },
            '404': { description: 'Venue not found' },
            '500': { description: 'Server error' },
          },
        },
        delete: {
          summary: 'Delete venue (query)',
          description: 'Deletes a venue. Required query venue_id.',
          tags: ['Venues'],
          parameters: [{ name: 'venue_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '204': { description: 'Venue deleted (no content)' },
            '400': { description: 'Invalid query params' },
            '404': { description: 'Venue not found' },
            '500': { description: 'Server error' },
          },
        },
      },
      '/api/venues/{venue_id}': {
        get: {
          summary: 'Get venue by ID',
          description:
            'Returns full venue details. Optional query user_id: when provided, venue_contacts contains only the contact assigned to this user via event_guests.',
          tags: ['Venues'],
          parameters: [
            { name: 'venue_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'user_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': {
              description: 'Venue details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'object', description: 'Venue with optional filtered venue_contacts' },
                    },
                  },
                },
              },
            },
            '404': { description: 'Venue not found' },
            '500': { description: 'Server error' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication and OTP' },
      { name: 'Users', description: 'User management' },
      { name: 'Feed', description: 'Feed posts with image/video upload' },
      { name: 'Favorites', description: 'Per-event favorites of gallery media and feed posts' },
      { name: 'Events', description: 'Events, highlights, days, explore categories and items' },
      { name: 'App configurations', description: 'App configuration management' },
      { name: 'CMS', description: 'CMS pages' },
      { name: 'Venues', description: 'Venue details' },
    ],
  };
}
