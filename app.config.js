require('dotenv').config({ path: '.env.local' });

module.exports = {
  expo: {
    name: "YiChat",
    slug: "YiChat",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.yichat.app",
      googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST || "./GoogleService-Info.plist",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.yichat.app",
      permissions: [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "CAMERA"
      ],
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-sqlite",
      "expo-web-browser",
      [
        "expo-camera",
        {
          "cameraPermission": "Allow YiChat to access your camera to scan QR codes for connecting to the development server."
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/adaptive-icon.png",
          "color": "#ffffff",
          "sounds": []
        }
      ]
    ],
    extra: {
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      // Google OAuth Client IDs (get from Google Cloud Console)
      googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
      eas: {
        projectId: "8df0cbc4-c26c-4d74-bc2d-331891e1999b"
      }
    },
    scheme: "yichat"
  }
};

