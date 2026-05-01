import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

const MOCK_POSTS = [
  {
    id: '1', userName: 'Alex M.', initials: 'AM', avatarColor: '#4488FF',
    workoutName: 'Upper Push Day', duration: 52, exercises: 6, rating: 'just_right',
    caption: 'New bench PR today! 85kg finally went up clean.', likes: 14, liked: false, time: '2h ago',
  },
  {
    id: '2', userName: 'Sarah K.', initials: 'SK', avatarColor: '#FF4488',
    workoutName: 'Surf Prep — Legs & Core', duration: 45, exercises: 7, rating: 'hard',
    caption: null, likes: 9, liked: true, time: '4h ago',
  },
  {
    id: '3', userName: 'James R.', initials: 'JR', avatarColor: '#44FF88',
    workoutName: 'Full Body Kickstart', duration: 38, exercises: 5, rating: 'easy',
    caption: 'Back at it after 2 weeks off. Felt great!', likes: 21, liked: false, time: 'Yesterday',
  },
];

const CHALLENGES: { id: string; name: string; icon: keyof typeof Ionicons.glyphMap; participants: number; daysLeft: number; myProgress: number; target: number }[] = [
  { id: '1', name: '30-Day Push-Up Challenge',  icon: 'barbell-outline',  participants: 234, daysLeft: 18, myProgress: 12, target: 30 },
  { id: '2', name: 'Train 5x This Week',         icon: 'flame-outline',    participants: 89,  daysLeft: 4,  myProgress: 3,  target: 5 },
  { id: '3', name: '100 Squats a Day',           icon: 'body-outline',     participants: 156, daysLeft: 22, myProgress: 0,  target: 30 },
];

const RATING_LABELS: Record<string, string> = {
  easy: 'Easy',
  just_right: 'Just right',
  hard: 'Hard',
};

const RATING_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  easy: 'moon-outline',
  just_right: 'barbell-outline',
  hard: 'flame-outline',
};

function PostCard({ post }: { post: typeof MOCK_POSTS[number] }) {
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likes);

  return (
    <View style={{
      backgroundColor: Colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: post.avatarColor + '44', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: post.avatarColor }}>
          <Text style={{ color: post.avatarColor, fontWeight: '800', fontSize: 14 }}>{post.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 15 }}>{post.userName}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>{post.time}</Text>
        </View>
      </View>

      {/* Workout info */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <View style={{ backgroundColor: Colors.surface2, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>COMPLETED</Text>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 }}>{post.workoutName}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="timer-outline" size={13} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{post.duration} min</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="barbell-outline" size={13} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{post.exercises} exercises</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={RATING_ICONS[post.rating]} size={13} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{RATING_LABELS[post.rating]}</Text>
            </View>
          </View>
        </View>

        {post.caption && (
          <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{post.caption}</Text>
        )}

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity
            onPress={() => { setLiked((l) => !l); setLikeCount((c) => liked ? c - 1 : c + 1); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? Colors.danger : Colors.textSecondary} />
            <Text style={{ color: liked ? Colors.danger : Colors.textSecondary, fontWeight: '600', fontSize: 14 }}>{likeCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.textSecondary} />
            <Text style={{ color: Colors.textSecondary, fontWeight: '600', fontSize: 14 }}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function SocialScreen() {
  const [activeTab, setActiveTab] = useState<'feed' | 'challenges'>('feed');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <View style={{ padding: 24, paddingBottom: 0 }}>
        <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', marginBottom: 16 }}>Social</Text>

        {/* Tab switch */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.surface2, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Colors.border }}>
          {(['feed', 'challenges'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 9,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: activeTab === tab ? Colors.surface3 : 'transparent',
              }}
            >
              <Ionicons
                name={tab === 'feed' ? 'newspaper-outline' : 'trophy-outline'}
                size={16}
                color={activeTab === tab ? Colors.text : Colors.muted}
              />
              <Text style={{ color: activeTab === tab ? Colors.text : Colors.muted, fontWeight: '700', textTransform: 'capitalize' }}>
                {tab === 'feed' ? 'Feed' : 'Challenges'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 16, paddingBottom: 40 }}>
        {activeTab === 'feed' ? (
          <>
            {/* Stories row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, marginHorizontal: -24, paddingHorizontal: 24 }}>
              <TouchableOpacity style={{ alignItems: 'center', marginRight: 16 }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed' }}>
                  <Ionicons name="add" size={24} color={Colors.primary} />
                </View>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>You</Text>
              </TouchableOpacity>
              {MOCK_POSTS.map((p) => (
                <TouchableOpacity key={p.id} style={{ alignItems: 'center', marginRight: 16 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: p.avatarColor + '44', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: p.avatarColor }}>
                    <Text style={{ color: p.avatarColor, fontWeight: '800', fontSize: 16 }}>{p.initials}</Text>
                  </View>
                  <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 4 }}>{p.userName.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Posts */}
            {MOCK_POSTS.map((post) => <PostCard key={post.id} post={post} />)}
          </>
        ) : (
          <>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, marginBottom: 16 }}>
              Complete challenges to level up on leaderboards.
            </Text>
            {CHALLENGES.map((c) => (
              <View key={c.id} style={{
                backgroundColor: Colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: Colors.border,
                padding: 16,
                marginBottom: 12,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={c.icon} size={24} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16 }}>{c.name}</Text>
                    <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 2 }}>
                      {c.participants} participants · {c.daysLeft} days left
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={{ height: 8, backgroundColor: Colors.surface3, borderRadius: 4, marginBottom: 6 }}>
                  <View style={{
                    height: 8,
                    width: `${(c.myProgress / c.target) * 100}%`,
                    backgroundColor: Colors.primary,
                    borderRadius: 4,
                  }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>My progress: {c.myProgress}/{c.target}</Text>
                  <TouchableOpacity>
                    <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '700' }}>
                      {c.myProgress === 0 ? 'Join' : 'View leaderboard'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={{ backgroundColor: Colors.surface2, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 15 }}>Create a Challenge</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
