import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { showToast } from '@/components/ui/toast';
import { libraryActions, useIsLiked } from '@/features/library/store';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import { useIsDark, usePalette } from '@/hooks/use-palette';

export const MINI_PLAYER_HEIGHT = 58;

let lastOpenPlayerAt = 0;

function ProgressHairline() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View
      position="absolute"
      left={16}
      right={16}
      bottom={0}
      height={2.5}
      borderRadius={999}
      backgroundColor={palette.cardAlt}
      overflow="hidden">
      <View
        width={`${ratio * 100}%`}
        height="100%"
        borderRadius={999}
        backgroundColor={palette.accent}
      />
    </View>
  );
}

export function MiniPlayer() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const { track, playing, loading, buffering } = usePlayer();
  const liked = useIsLiked(track?.hash);
  const [likeBusy, setLikeBusy] = useState(false);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      rotation.value = withRepeat(
        withTiming(rotation.value + 360, { duration: 16000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [playing, rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value % 360}deg` }],
  }));

  if (!track) {
    return null;
  }

  const busy = loading || buffering;

  function handleToggleLike() {
    if (!track || likeBusy) {
      return;
    }
    setLikeBusy(true);
    libraryActions
      .toggleLike(track)
      .then((result) => {
        showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      })
      .catch((cause) => {
        showToast(cause instanceof Error ? cause.message : '操作失败');
      })
      .finally(() => setLikeBusy(false));
  }

  function openPlayer() {
    const now = Date.now();
    if (now - lastOpenPlayerAt < 800) {
      return;
    }

    lastOpenPlayerAt = now;
    router.push('/player');
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(200)}>
      <XStack
        height={MINI_PLAYER_HEIGHT}
        alignItems="center"
        gap={10}
        paddingHorizontal={12}
        borderRadius={22}
        borderWidth={StyleSheet.hairlineWidth}
        borderColor={palette.border}
        backgroundColor={palette.barSurface}
        shadowColor={palette.dockShadow}
        shadowOffset={{ width: 0, height: isDark ? 3 : 8 }}
        shadowOpacity={isDark ? 0.18 : 0.1}
        shadowRadius={isDark ? 8 : 16}
        elevation={isDark ? 0 : 8}
        transition="quickest"
        pressStyle={{ scale: 0.985 }}
        onPress={openPlayer}>
        <Animated.View style={[{ width: 40, height: 40 }, spinStyle]}>
          <Artwork uri={track.coverUrl} size={40} circle />
        </Animated.View>

        <YStack flex={1} gap={1}>
          <Text color={palette.text} fontSize={13.5} fontWeight="600" numberOfLines={1}>
            {track.title}
          </Text>
          <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
            {track.artist || '未知歌手'}
          </Text>
        </YStack>

        <XStack
          width={30}
          height={38}
          alignItems="center"
          justifyContent="center"
          opacity={likeBusy ? 0.5 : 1}
          transition="quickest"
          pressStyle={{ scale: 0.88, opacity: 0.6 }}
          onPress={(event) => {
            event.stopPropagation();
            handleToggleLike();
          }}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={18}
            color={liked ? palette.accent : palette.textSecondary}
          />
        </XStack>

        <XStack
          width={38}
          height={38}
          borderRadius={19}
          alignItems="center"
          justifyContent="center"
          backgroundColor={palette.accentSoft}
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.7 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.toggle();
          }}>
          {busy ? (
            <Spinner size="small" color={palette.accent} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={18}
              color={palette.accent}
              style={playing ? undefined : { marginLeft: 2 }}
            />
          )}
        </XStack>

        <XStack
          width={34}
          height={38}
          alignItems="center"
          justifyContent="center"
          transition="quickest"
          pressStyle={{ scale: 0.9, opacity: 0.6 }}
          onPress={(event) => {
            event.stopPropagation();
            playerActions.next();
          }}>
          <Ionicons name="play-skip-forward" size={19} color={palette.textSecondary} />
        </XStack>

        <ProgressHairline />
      </XStack>
    </Animated.View>
  );
}
