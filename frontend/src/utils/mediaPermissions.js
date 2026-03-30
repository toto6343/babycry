// src/utils/mediaPermissions.js
/**
 * 미디어 권한 체크 및 관리 유틸리티
 */

/**
 * 미디어 장치 및 권한 상태 확인
 * @returns {Promise<{hasPermission: boolean, hasCamera: boolean, hasMicrophone: boolean, error: object|null}>}
 */
export const checkMediaPermissions = async () => {
  try {
    // 1. 브라우저 지원 확인
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        hasPermission: false,
        hasCamera: false,
        hasMicrophone: false,
        error: {
          type: 'unsupported',
          message: '이 브라우저는 화상 통화를 지원하지 않습니다.'
        }
      };
    }

    // 2. 연결된 미디어 장치 확인
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some(device => device.kind === 'videoinput');
    const hasMicrophone = devices.some(device => device.kind === 'audioinput');

    if (!hasCamera && !hasMicrophone) {
      return {
        hasPermission: false,
        hasCamera,
        hasMicrophone,
        error: {
          type: 'no-devices',
          message: '카메라와 마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요.'
        }
      };
    }

    // 3. Permissions API로 권한 상태 확인 (지원하는 브라우저만)
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const [cameraPermission, micPermission] = await Promise.all([
          navigator.permissions.query({ name: 'camera' }),
          navigator.permissions.query({ name: 'microphone' })
        ]);

        const hasPermission = 
          cameraPermission.state === 'granted' && 
          micPermission.state === 'granted';

        const isDenied = 
          cameraPermission.state === 'denied' || 
          micPermission.state === 'denied';

        if (isDenied) {
          return {
            hasPermission: false,
            hasCamera,
            hasMicrophone,
            error: {
              type: 'denied',
              message: '카메라 또는 마이크 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.'
            }
          };
        }

        return {
          hasPermission,
          hasCamera,
          hasMicrophone,
          error: null
        };
      } catch (err) {
        // Permissions API 미지원 - 직접 권한 요청 필요
        console.log('Permissions API 미지원:', err);
      }
    }

    // 4. Permissions API 미지원 시 - 실제 스트림 요청으로 권한 확인
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      // 권한 획득 성공 - 즉시 스트림 종료
      stream.getTracks().forEach(track => track.stop());

      return {
        hasPermission: true,
        hasCamera,
        hasMicrophone,
        error: null
      };
    } catch (error) {
      return {
        hasPermission: false,
        hasCamera,
        hasMicrophone,
        error: {
          type: 'prompt',
          message: '화상 통화를 위해 카메라와 마이크 권한이 필요합니다.'
        }
      };
    }

  } catch (error) {
    console.error('미디어 권한 체크 실패:', error);
    return {
      hasPermission: false,
      hasCamera: false,
      hasMicrophone: false,
      error: {
        type: 'error',
        message: '미디어 장치를 확인하는 중 오류가 발생했습니다.'
      }
    };
  }
};

/**
 * 미디어 권한 요청
 * @returns {Promise<{success: boolean, stream: MediaStream|null, error: object|null}>}
 */
export const requestMediaPermissions = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    return {
      success: true,
      stream,
      error: null
    };
  } catch (error) {
    console.error('미디어 권한 요청 실패:', error);

    let errorMessage = '카메라/마이크 접근 권한이 필요합니다.';
    let errorType = 'denied';

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMessage = '카메라와 마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.';
      errorType = 'denied';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMessage = '카메라 또는 마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요.';
      errorType = 'no-devices';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMessage = '카메라 또는 마이크가 이미 다른 프로그램에서 사용 중입니다.';
      errorType = 'in-use';
    } else if (error.name === 'OverconstrainedError') {
      errorMessage = '요청한 카메라 설정을 지원하지 않습니다.';
      errorType = 'unsupported';
    }

    return {
      success: false,
      stream: null,
      error: {
        type: errorType,
        message: errorMessage
      }
    };
  }
};

/**
 * 브라우저별 권한 설정 안내
 * @returns {string}
 */
export const getBrowserPermissionGuide = () => {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('chrome')) {
    return 'Chrome: 주소창 좌측의 자물쇠/카메라 아이콘 클릭 → 권한 설정 → 카메라/마이크 허용';
  } else if (userAgent.includes('firefox')) {
    return 'Firefox: 주소창 좌측의 자물쇠 아이콘 클릭 → 권한 → 카메라/마이크 허용';
  } else if (userAgent.includes('safari')) {
    return 'Safari: Safari 메뉴 → 설정 → 웹사이트 → 카메라/마이크 → 이 사이트 허용';
  } else if (userAgent.includes('edge')) {
    return 'Edge: 주소창 좌측의 자물쇠 아이콘 클릭 → 사이트 권한 → 카메라/마이크 허용';
  }

  return '브라우저 설정에서 이 사이트의 카메라/마이크 권한을 허용해주세요.';
};