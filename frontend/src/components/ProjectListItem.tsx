import { memo } from 'react';
import { GitFork, Star } from 'lucide-react';
import UserBadges from './UserBadges';
import UserLink from './UserLink';
import type { GiteaProject } from '../api/types';
import { formatTime } from '../utils/content';

interface Props {
  project: GiteaProject;
}

/** 开源码桶列表行：结构对齐帖子列表；作者一律用论坛用户，不展示 Gitea login */
function ProjectListItem({ project }: Props) {
  const owner = project.owner;
  // 未绑定论坛用户的仓库不应出现在列表；兜底不渲染
  if (!owner?.id) return null;

  const title = project.name || project.full_name;
  const initial = owner.nickname?.[0] || '?';
  const remoteIso = project.updated_at_remote ?? undefined;
  const timeLabel = remoteIso ? formatTime(remoteIso) : '';
  const stars = project.stars_count ?? 0;
  const forks = project.forks_count ?? 0;

  const open = () => {
    if (!project.html_url) return;
    window.open(project.html_url, '_blank', 'noopener,noreferrer');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const onTitleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    open();
  };

  return (
    <div
      className="post-row post-row--v2 project-list-item"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <UserLink
        user={owner}
        showAvatar={false}
        showName={false}
        stopPropagation
        className="post-avatar user-link--avatar-only"
      >
        {owner.avatar
          ? <img src={owner.avatar} alt="" loading="lazy" decoding="async" />
          : initial}
      </UserLink>

      <div className="post-main">
        <div className="post-text">
          <div className="post-title-row">
            {project.language ? (
              <span className="project-lang-badge" title="主要语言">{project.language}</span>
            ) : null}
            <a
              href={project.html_url}
              className="post-title"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onTitleClick}
            >
              {title}
            </a>
          </div>
          {project.description ? (
            <p className="post-excerpt">{project.description}</p>
          ) : null}
        </div>
        <div className="post-meta">
          <div className="post-meta-left">
            <UserLink
              user={owner}
              stopPropagation
              className="post-meta-author"
              showBadges={false}
            />
            <UserBadges user={owner} compact maxAchievement={3} className="project-list-badges" />
            {timeLabel ? (
              <>
                <span className="post-meta-sep post-meta-sep--before-time" aria-hidden>·</span>
                <span className="post-meta-time post-meta-time--created" title={remoteIso}>
                  {timeLabel}
                </span>
              </>
            ) : null}
          </div>
          <div className="post-stats">
            <span className={`post-stat${stars === 0 ? ' post-stat--zero' : ''}`} title="Stars">
              <Star aria-hidden />
              {stars}
            </span>
            <span className={`post-stat${forks === 0 ? ' post-stat--zero' : ''}`} title="Forks">
              <GitFork aria-hidden />
              {forks}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ProjectListItem);
