import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Eye, Heart, MessageCircle, MessagesSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listPosts, type PostRead, type PostSort, type TimeRange } from '@/api/forum'
import { FORUM_TAG_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

const ANY = '__any__'

export function Forum() {
  const { t } = useTranslation()
  const [tag, setTag] = useState<string>(ANY)
  const [sort, setSort] = useState<PostSort>('hot')
  const [range, setRange] = useState<TimeRange>('all')

  const query = useQuery({
    queryKey: ['forum-posts', { tag, sort, range }],
    queryFn: () =>
      listPosts({
        tag: tag === ANY ? undefined : tag,
        sort,
        range,
      }),
  })

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('forum.title')}</h1>
          <p className="text-muted-foreground">{t('forum.subtitle')}</p>
        </div>
        <Link to="/forum/new">
          <Button>
            <Plus className="size-4" />
            {t('forum.newPost')}
          </Button>
        </Link>
      </header>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={sort} onValueChange={(v) => setSort(v as PostSort)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hot">{t('forum.sortHot')}</SelectItem>
              <SelectItem value="new">{t('forum.sortNew')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(v) => setRange(v as TimeRange)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('forum.rangeAll')}</SelectItem>
              <SelectItem value="day">{t('forum.rangeDay')}</SelectItem>
              <SelectItem value="week">{t('forum.rangeWeek')}</SelectItem>
              <SelectItem value="month">{t('forum.rangeMonth')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          {[ANY, ...FORUM_TAG_OPTIONS].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTag(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                tag === value
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-muted-foreground hover:bg-secondary',
              )}
            >
              {value === ANY ? t('forum.anyTag') : t(`forumTags.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : t('common.error')}
        </p>
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <MessagesSquare className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">{t('forum.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {query.data!.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

function PostRow({ post }: { post: PostRead }) {
  const { t } = useTranslation()
  const initials = post.author.display_name.slice(0, 2).toUpperCase()

  return (
    <Link
      to={`/forum/${post.id}`}
      className="group block rounded-2xl border border-border/60 bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-snug">{post.title}</h2>
        <Badge variant="open" className="shrink-0">
          {t(`forumTags.${post.tag}`, { defaultValue: post.tag })}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{post.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="bg-brand-100 text-[10px] font-semibold text-brand-700">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground">{post.author.display_name}</span>
          <span>{new Date(post.created_at).toLocaleDateString()}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-4">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" />
            {post.view_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className={cn('size-3.5', post.liked_by_me && 'fill-rose-500 text-rose-500')} />
            {post.like_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3.5" />
            {post.comment_count}
          </span>
        </span>
      </div>
    </Link>
  )
}
