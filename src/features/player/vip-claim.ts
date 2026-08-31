import { isLoggedIn } from '@/features/account/user-api';
import { mobileApi } from '@/lib/kugou-api';
import { getKugouPlatform } from '@/lib/kugou-api/bootstrap';

// 这些上报/领取只做“尽力而为”，失败静默，绝不打断播放或弹错误。
// 仅在概念版(lite)且已登录时触发——正式版不具备听歌自动领畅听 VIP 的能力。
const reportedHashes = new Set<string>();
let lastClaimDateKey = '';

function todayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 播放成功后上报听歌记录并尝试领取当日畅听 VIP。
 * 同一首歌仅上报一次；当日 VIP 仅尝试领取一次，重复请求交给服务端幂等处理。
 */
export async function maybeReportListenAndClaimVip(hash: string, mixsongid?: string): Promise<void> {
  try {
    if (getKugouPlatform() !== 'lite' || !isLoggedIn()) {
      return;
    }

    if (hash && !reportedHashes.has(hash)) {
      reportedHashes.add(hash);
      // 防极端长跑下无限增长：超出上限时清空即可，多上报一次无副作用。
      if (reportedHashes.size > 500) {
        reportedHashes.clear();
      }
      await mobileApi.youth_listen_song({ mixsongid: mixsongid || 666075191 });
    }

    const today = todayDateKey();
    if (today === lastClaimDateKey) {
      return;
    }
    lastClaimDateKey = today;
    await mobileApi.youth_day_vip({ receive_day: 1 });
  } catch {
    // 静默：签到/领取失败不影响播放主流程。
  }
}