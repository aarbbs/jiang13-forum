package model

import (
	"time"

	"gorm.io/gorm"
)

// Role 用户角色
type Role string

const (
	RoleUser  Role = "user"
	RoleAdmin Role = "admin"
)

// 内容审核状态（帖子 / 评论）
const (
	ContentStatusPending   = "pending"   // 审核中（仅作者与管理员可见）
	ContentStatusPublished = "published" // 已公开
	ContentStatusRejected  = "rejected"  // 未通过（仅作者与管理员可见）
)

// 帖子类型
const (
	PostTypeNormal   = "normal"   // 普通讨论
	PostTypeQuestion = "question" // 问答（未解决 / 已解决）
	PostTypePoll     = "poll"     // 投票
	PostTypeBounty   = "bounty"   // 悬赏
	PostTypeLottery  = "lottery"  // 抽奖
)

// 悬赏状态
const (
	BountyStatusOpen     = "open"
	BountyStatusAwarded  = "awarded"
	BountyStatusRefunded = "refunded"
)

// 帖内抽奖状态
const (
	PostLotteryStatusOpen  = "open"
	PostLotteryStatusDrawn = "drawn"
)

// User 用户表
// Email / Password / LastLogin* / LastAccessAt 默认不随帖子等嵌套 User 序列化；
// 个人中心与后台列表请用 UserSelf / UserAdmin。
type User struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	Username           string         `gorm:"uniqueIndex;size:128;not null" json:"username"`
	Email              string         `gorm:"index;size:128;default:''" json:"-"`
	Password           string         `gorm:"size:128;not null" json:"-"`
	Nickname           string         `gorm:"size:64" json:"nickname"`
	Signature          string         `gorm:"size:512;default:''" json:"signature"` // 个人签名
	Avatar             string         `gorm:"size:512" json:"avatar"`               // 兼容 CDN / S3 较长绝对 URL
	Role               Role           `gorm:"size:16;default:user" json:"role"`
	Verified           bool           `gorm:"default:false;index" json:"verified"`   // 站长认证：免审发帖/评论
	Exp                int            `gorm:"default:0" json:"exp"`                  // 经验（不可消费）
	Points             int            `gorm:"default:0" json:"points"`               // 可用积分
	CreatorIncomeTotal int            `gorm:"default:0" json:"creator_income_total"` // 累计创作分成
	Banned             bool           `gorm:"default:false" json:"banned"`
	BannedAt           *time.Time     `json:"banned_at,omitempty"`
	LastLoginAt        *time.Time     `json:"-"`
	LastLoginIP        string         `gorm:"size:45;default:''" json:"-"` // 兼容 IPv6
	LastAccessAt       *time.Time     `json:"-"`                           // 最近一次带鉴权的访问（与登录分开）
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`

	// 仅序列化展示用，不落库
	Level  int             `gorm:"-" json:"level"`
	Badges []UserBadgeView `gorm:"-" json:"badges,omitempty"`
}

// AfterFind 填充展示用等级
func (u *User) AfterFind(tx *gorm.DB) (err error) {
	u.Level = LevelFromExp(u.Exp)
	return nil
}

// SkipsModeration 站长或认证用户发帖/评论免审
func (u *User) SkipsModeration() bool {
	return u != nil && (u.Role == RoleAdmin || u.Verified)
}

// Board 论坛板块
type Board struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:64;not null" json:"name"`
	Description string         `gorm:"size:512" json:"description"`
	Icon        string         `gorm:"size:64;default:''" json:"icon"`
	ColorIndex  int            `gorm:"default:-1" json:"color_index"` // -1 表示按 id 自动取色
	SortOrder   int            `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// Post 帖子
type Post struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	BoardID            uint           `gorm:"index;not null" json:"board_id"`
	UserID             uint           `gorm:"index;not null" json:"user_id"`
	Title              string         `gorm:"size:256;not null" json:"title"`
	Content            string         `gorm:"type:text;not null" json:"content"`
	ContentPlain       string         `gorm:"type:text" json:"-"` // 正文纯文本，供搜索索引
	Tags               string         `gorm:"size:256" json:"tags"`
	PostType           string         `gorm:"size:16;default:normal;index" json:"post_type"`  // normal|question|poll|bounty|lottery
	QuestionResolved   bool           `gorm:"default:false;index" json:"question_resolved"`   // 仅 question 有意义
	BountyPoints       int            `gorm:"default:0" json:"bounty_points"`                 // 悬赏积分（仅 bounty）
	BountyStatus       string         `gorm:"size:16;default:'';index" json:"bounty_status"`  // open|awarded|refunded
	BountyCommentID    uint           `gorm:"default:0" json:"bounty_comment_id"`             // 采纳的评论
	LotteryWinnerCount int            `gorm:"default:1" json:"lottery_winner_count"`          // 抽奖人数（仅 lottery）
	LotteryStatus      string         `gorm:"size:16;default:'';index" json:"lottery_status"` // open|drawn
	Pinned             bool           `gorm:"default:false" json:"pinned"`                    // 全局置顶
	BoardPinned        bool           `gorm:"default:false" json:"board_pinned"`              // 板块内置顶
	Featured           bool           `gorm:"default:false;index" json:"featured"`            // 推荐帖（原精华）
	EditLocked         bool           `gorm:"default:false" json:"edit_locked"`
	CommentsLocked     bool           `gorm:"default:false" json:"comments_locked"`          // 禁止评论（结贴）
	Status             string         `gorm:"size:16;default:published;index" json:"status"` // pending|published|rejected
	LikeCount          int            `gorm:"default:0" json:"like_count"`
	ViewCount          int            `gorm:"default:0" json:"view_count"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`

	Board    Board     `gorm:"foreignKey:BoardID" json:"board,omitempty"`
	User     User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Comments []Comment `gorm:"foreignKey:PostID" json:"comments,omitempty"`
}

// PostRevision 帖子编辑历史（每次修改前保存旧版本）
type PostRevision struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"index;not null" json:"post_id"`
	EditorID  uint      `gorm:"index;not null" json:"editor_id"`
	Title     string    `gorm:"size:256;not null" json:"title"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Tags      string    `gorm:"size:256" json:"tags"`
	CreatedAt time.Time `json:"created_at"`

	Editor User `gorm:"foreignKey:EditorID" json:"editor,omitempty"`
}

// CommentRevision 评论编辑历史（每次修改前保存旧版本，管理员可查看）
type CommentRevision struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CommentID uint      `gorm:"index;not null" json:"comment_id"`
	EditorID  uint      `gorm:"index;not null" json:"editor_id"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time `json:"created_at"`

	Editor User `gorm:"foreignKey:EditorID" json:"editor,omitempty"`
}

// ForumSetting 论坛全局设置（键值对）
type ForumSetting struct {
	Key   string `gorm:"primaryKey;size:64" json:"key"`
	Value string `gorm:"size:2048" json:"value"`
}

// Comment 楼层评论
type Comment struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	PostID     uint           `gorm:"index;not null" json:"post_id"`
	UserID     uint           `gorm:"index" json:"user_id"` // 0 表示游客
	Floor      int            `gorm:"not null" json:"floor"`
	Content    string         `gorm:"type:text;not null" json:"content"`
	ReplyTo    *uint          `gorm:"index" json:"reply_to,omitempty"`
	GuestNick  string         `gorm:"size:64" json:"guest_nick,omitempty"`
	GuestEmail string         `gorm:"size:128" json:"guest_email,omitempty"`
	GuestURL   string         `gorm:"size:256" json:"guest_url,omitempty"`
	IsPrivate  bool           `gorm:"default:false" json:"is_private"`
	Status     string         `gorm:"size:16;default:published;index" json:"status"` // pending|published|rejected
	LikeCount  int            `gorm:"default:0" json:"like_count"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	User        User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Post        Post     `gorm:"foreignKey:PostID" json:"post,omitempty"`
	ReplyTarget *Comment `gorm:"-" json:"reply_target,omitempty"`
	// ThreadParentID 嵌套展示用父评论（父评论不可见时回挂到最近可见祖先）
	ThreadParentID *uint `gorm:"-" json:"thread_parent_id,omitempty"`
	ContentHidden  bool  `gorm:"-" json:"content_hidden"`
	Liked          bool  `gorm:"-" json:"liked"`
}

// PostLike 帖子点赞
type PostLike struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"uniqueIndex:idx_post_user;not null" json:"post_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_post_user;not null" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// CommentLike 评论点赞
type CommentLike struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CommentID uint      `gorm:"uniqueIndex:idx_comment_user;not null" json:"comment_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_comment_user;not null" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// PostFavorite 帖子收藏
type PostFavorite struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"uniqueIndex:idx_fav_post_user;not null" json:"post_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_fav_post_user;not null" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`

	Post Post `gorm:"foreignKey:PostID" json:"post,omitempty"`
}

// 私信类型
const (
	MessageKindUser         = "user"          // 用户互发
	MessageKindSystem       = "system"        // 系统通知
	MessageKindReject       = "reject"        // 帖子被拒/下架
	MessageKindReportResult = "report_result" // 举报处理结果
	MessageKindReply        = "reply"         // 帖子/评论被回复
	MessageKindMention      = "mention"       // 被 @提及
	MessageKindModeration   = "moderation"    // 新内容待审核（通知管理员）
)

// PrivateMessage 站内私信
type PrivateMessage struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	FromUserID        uint      `gorm:"index;not null" json:"from_user_id"` // 0 表示系统
	ToUserID          uint      `gorm:"index;not null" json:"to_user_id"`
	Subject           string    `gorm:"size:256;not null" json:"subject"`
	Content           string    `gorm:"type:text;not null" json:"content"`
	Kind              string    `gorm:"size:32;default:user;index" json:"kind"`
	RelatedPostID     *uint     `gorm:"index" json:"related_post_id,omitempty"`
	RelatedReportID   *uint     `gorm:"index" json:"related_report_id,omitempty"`
	RelatedCommentID  *uint     `gorm:"index" json:"related_comment_id,omitempty"`
	RelatedFloor      *int      `json:"related_floor,omitempty"` // 评论自身楼号，对应 #floor-N
	IsRead            bool      `gorm:"default:false;index" json:"is_read"`
	CreatedAt         time.Time `json:"created_at"`
	// RelatedStatus 列表接口实时回填：pending|published|rejected|deleted（不落库）
	RelatedStatus string `json:"related_status,omitempty" gorm:"-"`

	FromUser User `gorm:"foreignKey:FromUserID" json:"from_user,omitempty"`
	ToUser   User `gorm:"foreignKey:ToUserID" json:"to_user,omitempty"`
}

// 举报状态
const (
	ReportStatusPending   = "pending"
	ReportStatusResolved  = "resolved"
	ReportStatusDismissed = "dismissed"
)

// 举报原因
const (
	ReportReasonSpam       = "spam"
	ReportReasonAbuse      = "abuse"
	ReportReasonIllegal    = "illegal"
	ReportReasonIrrelevant = "irrelevant"
	ReportReasonOther      = "other"
)

// 友链申请状态
const (
	FriendLinkApplyStatusPending  = "pending"
	FriendLinkApplyStatusApproved = "approved"
	FriendLinkApplyStatusRejected = "rejected"
)

// FriendLinkApply 友情链接申请
type FriendLinkApply struct {
	ID                  uint           `gorm:"primaryKey" json:"id"`
	UserID              uint           `gorm:"index;not null" json:"user_id"`
	Name                string         `gorm:"size:32;not null" json:"name"`
	URL                 string         `gorm:"size:512;not null" json:"url"`
	Description         string         `gorm:"size:200;default:''" json:"description,omitempty"`
	Logo                string         `gorm:"size:512;default:''" json:"logo"`
	ReciprocalPageURL   string         `gorm:"size:512;default:''" json:"reciprocal_page_url"`
	LinkOnHomepage      bool           `gorm:"default:true" json:"link_on_homepage"`
	ReciprocalVerified  bool           `gorm:"default:false" json:"reciprocal_verified"`
	ReciprocalCheckNote string         `gorm:"size:256;default:''" json:"reciprocal_check_note,omitempty"`
	ReciprocalCheckedAt *time.Time     `json:"reciprocal_checked_at,omitempty"`
	Status              string         `gorm:"size:16;default:pending;index" json:"status"`
	ReviewNote          string         `gorm:"size:256;default:''" json:"review_note,omitempty"`
	ReviewedAt          *time.Time     `json:"reviewed_at,omitempty"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// PostReport 帖子/评论举报（CommentID 有值时为评论举报）
type PostReport struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	PostID     uint       `gorm:"index;not null" json:"post_id"`
	CommentID  *uint      `gorm:"index" json:"comment_id,omitempty"`
	ReporterID uint       `gorm:"index;not null" json:"reporter_id"`
	Reason     string     `gorm:"size:32;not null" json:"reason"`
	Detail     string     `gorm:"size:1000" json:"detail"`
	Status     string     `gorm:"size:16;default:pending;index" json:"status"`
	HandlerID  *uint      `gorm:"index" json:"handler_id,omitempty"`
	HandleNote string     `gorm:"size:1000" json:"handle_note"`
	CreatedAt  time.Time  `json:"created_at"`
	HandledAt  *time.Time `json:"handled_at,omitempty"`

	Post     Post     `gorm:"foreignKey:PostID" json:"post,omitempty"`
	Comment  *Comment `gorm:"foreignKey:CommentID" json:"comment,omitempty"`
	Reporter User     `gorm:"foreignKey:ReporterID" json:"reporter,omitempty"`
	Handler  *User    `gorm:"foreignKey:HandlerID" json:"handler,omitempty"`
}

// Media 上传媒体索引（真实文件在本地 uploads 或 S3；本表供后台列表与统计）
type Media struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Category    string    `gorm:"size:32;index;not null" json:"category"` // avatars|posts|site
	Name        string    `gorm:"size:255;not null" json:"name"`
	URL         string    `gorm:"size:512;uniqueIndex;not null" json:"url"`
	Size        int64     `gorm:"not null;default:0" json:"size"`
	ContentType string    `gorm:"size:64;default:''" json:"content_type"`
	StorageType string    `gorm:"size:16;index;default:local" json:"storage_type"` // local|s3
	UserID      *uint     `gorm:"index" json:"user_id,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// 积分流水原因
const (
	PointReasonCheckIn       = "check_in"
	PointReasonLottery       = "lottery"
	PointReasonUnlockSpend   = "unlock_spend"
	PointReasonCreatorIncome = "creator_income"
	PointReasonAdminAdjust   = "admin_adjust"
	PointReasonBountyEscrow  = "bounty_escrow"
	PointReasonBountyAward   = "bounty_award"
	PointReasonBountyRefund  = "bounty_refund"
)

// PointLedger 积分流水
type PointLedger struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	Delta     int       `gorm:"not null" json:"delta"`
	Balance   int       `gorm:"not null" json:"balance"` // 变动后余额
	Reason    string    `gorm:"size:32;index;not null" json:"reason"`
	RefType   string    `gorm:"size:32;default:''" json:"ref_type"`
	RefID     uint      `gorm:"default:0" json:"ref_id"`
	Note      string    `gorm:"size:256;default:''" json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

// CheckIn 每日签到（用户+自然日唯一）
type CheckIn struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_checkin_user_day;not null" json:"user_id"`
	Day       string    `gorm:"uniqueIndex:idx_checkin_user_day;size:10;not null" json:"day"` // YYYY-MM-DD
	Points    int       `gorm:"not null" json:"points"`
	Streak    int       `gorm:"default:1" json:"streak"`
	CreatedAt time.Time `json:"created_at"`
}

// LotteryDraw 每日抽奖记录
type LotteryDraw struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_lottery_user_day;not null" json:"user_id"`
	Day       string    `gorm:"uniqueIndex:idx_lottery_user_day;size:10;not null" json:"day"`
	Points    int       `gorm:"not null" json:"points"` // 抽中积分（可为 0）
	CreatedAt time.Time `json:"created_at"`
}

// PostContentUnlock 帖子积分解锁记录
type PostContentUnlock struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_unlock_user_post_block;not null" json:"user_id"`
	PostID    uint      `gorm:"uniqueIndex:idx_unlock_user_post_block;index;not null" json:"post_id"`
	BlockKey  string    `gorm:"uniqueIndex:idx_unlock_user_post_block;size:64;not null" json:"block_key"`
	Cost      int       `gorm:"not null" json:"cost"`
	CreatedAt time.Time `json:"created_at"`
}

// SitePage 自定义单页（关于我们、版规等）
type SitePage struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Title        string         `gorm:"size:128;not null" json:"title"`
	Slug         string         `gorm:"uniqueIndex;size:64;not null" json:"slug"`
	Content      string         `gorm:"type:text;not null" json:"content"`
	Published    bool           `gorm:"default:false;index" json:"published"`
	SortOrder    int            `gorm:"default:0" json:"sort_order"`
	ShowInFooter bool           `gorm:"default:false" json:"show_in_footer"`
	ShowInNav    bool           `gorm:"default:false" json:"show_in_nav"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// Poll 投票帖配置
type Poll struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	PostID     uint       `gorm:"uniqueIndex;not null" json:"post_id"`
	Multi      bool       `gorm:"default:false" json:"multi"`
	MaxChoices int        `gorm:"default:1" json:"max_choices"`
	Closed     bool       `gorm:"default:false;index" json:"closed"`
	EndsAt     *time.Time `gorm:"index" json:"ends_at,omitempty"`
}

// PollOption 投票选项
type PollOption struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	PostID    uint   `gorm:"index;not null" json:"post_id"`
	Text      string `gorm:"size:64;not null" json:"text"`
	SortOrder int    `gorm:"default:0" json:"sort_order"`
	VoteCount int    `gorm:"default:0" json:"vote_count"`
}

// PollVote 投票记录
type PollVote struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	PostID   uint `gorm:"uniqueIndex:idx_poll_vote_multi;index;not null" json:"post_id"`
	OptionID uint `gorm:"uniqueIndex:idx_poll_vote_multi;index;not null" json:"option_id"`
	UserID   uint `gorm:"uniqueIndex:idx_poll_vote_multi;index;not null" json:"user_id"`
}

// PostLotteryWinner 帖内抽奖中奖记录
type PostLotteryWinner struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"index;not null" json:"post_id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	CommentID uint      `gorm:"default:0" json:"comment_id"`
	CreatedAt time.Time `json:"created_at"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// 徽章类型
const (
	BadgeKindAuto    = "auto"
	BadgeKindLimited = "limited"
)

// 自动徽章指标
const (
	BadgeMetricTenureDays    = "tenure_days"
	BadgeMetricLikesReceived = "likes_received"
	BadgeMetricCreatorIncome = "creator_income"
)

// BadgeDef 徽章定义
type BadgeDef struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Code        string    `gorm:"uniqueIndex;size:64;not null" json:"code"`
	Name        string    `gorm:"size:64;not null" json:"name"`
	Description string    `gorm:"size:256;default:''" json:"description"`
	Icon        string    `gorm:"size:64;default:''" json:"icon"`     // lucide / 固定 key
	Kind        string    `gorm:"size:16;index;not null" json:"kind"` // auto|limited
	Metric      string    `gorm:"size:32;default:''" json:"metric"`
	Threshold   int       `gorm:"default:0" json:"threshold"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	Enabled     bool      `gorm:"default:true;index" json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UserBadge 用户已获徽章
type UserBadge struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_user_badge;not null" json:"user_id"`
	BadgeID   uint      `gorm:"uniqueIndex:idx_user_badge;index;not null" json:"badge_id"`
	AwardedAt time.Time `json:"awarded_at"`
	AwardedBy uint      `gorm:"default:0" json:"awarded_by"` // 0=系统
	Badge     BadgeDef  `gorm:"foreignKey:BadgeID" json:"badge,omitempty"`
}

// CommunityInstance 社区枢纽收到的公网实例心跳
type CommunityInstance struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	InstanceID   string    `gorm:"size:64;uniqueIndex;not null" json:"instance_id"`
	SiteURL      string    `gorm:"size:512;not null" json:"site_url"`
	SiteName     string    `gorm:"size:128" json:"site_name"`
	Version      string    `gorm:"size:32" json:"version"`
	Users        int64     `gorm:"default:0" json:"users"`
	Posts        int64     `gorm:"default:0" json:"posts"`
	RemoteIP     string    `gorm:"size:64" json:"remote_ip,omitempty"`
	Featured     bool      `gorm:"default:false;index" json:"featured"` // 人工精选后进入公开展柜
	FeaturedNote string    `gorm:"size:64" json:"featured_note"`        // 展柜短注
	FirstSeenAt  time.Time `json:"first_seen_at"`
	LastSeenAt   time.Time `gorm:"index" json:"last_seen_at"`
}

// PageView 前台路由浏览量（第一方 SPA 信标；存独立 monitor.db；请求日志走 jsonl）
type PageView struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"index;not null" json:"created_at"`
	Path      string    `gorm:"size:512;index" json:"path"`
	Referrer  string    `gorm:"size:512" json:"referrer"`
	IP        string    `gorm:"size:64;index" json:"ip"` // 完整客户端 IP
	UA        string    `gorm:"size:512" json:"ua"`
	Country   string    `gorm:"size:8;index" json:"country"`
	Region    string    `gorm:"size:64" json:"region"`
	RegionISO string    `gorm:"size:16;index" json:"region_iso"`
	City      string    `gorm:"size:64;index" json:"city"`
	ASN       uint      `gorm:"index" json:"asn"`
	ASOrg     string    `gorm:"size:128" json:"as_org"`
	IsBot     bool      `gorm:"default:false;index" json:"is_bot"`
}
