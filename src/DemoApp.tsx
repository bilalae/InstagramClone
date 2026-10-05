import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bookmark, ChevronLeft, ChevronRight, Compass, Film, Heart, House, Menu, MessageCircle,
  MoreHorizontal, PlusSquare, Search, Send, Settings, Smile, UserRound, X
} from 'lucide-react'
import './App.css'
import { getRemoteProfile, signInRemote, signUpRemote } from './lib/auth'
import { createRemotePost } from './lib/posts'
import { addComment, loadFeed, setPostLike, setSavedPost } from './lib/feed'
import { sendPasswordReset } from './lib/account'
import { getOrCreateDirectConversation, loadMessages, sendRemoteMessage } from './lib/messages'
import { subscribeToConversation } from './lib/realtime'
import { uploadMedia } from './lib/storage'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { appPath, routePath } from './hooks/useRoute'

type View = 'home' | 'search' | 'explore' | 'reels' | 'messages' | 'notifications' | 'profile' | 'create'
type Post = { id: string; user: string; location: string; avatar: string; image: string; likes: number; caption: string; time: string; comments: string[]; video?: boolean }
type Message = { id: number; from: string; text: string; time: string }
type User = { id: string; username: string; name: string; avatar: string; password: string }

const avatar = (id: number) => `https://i.pravatar.cc/120?img=${id}`
const initialStories = [
  { user: 'Your story', image: avatar(47), own: true }, { user: 'maria.luna', image: avatar(32) },
  { user: 'noahbuilds', image: avatar(12) }, { user: 'sunnyside', image: avatar(49) },
  { user: 'drew.thinks', image: avatar(68) }, { user: 'lena.studio', image: avatar(44) }, { user: 'atlas.and.co', image: avatar(53) },
]
const initialPosts: Post[] = [
  { id: '1', user: 'oliverandthecity', location: 'New York, New York', avatar: avatar(11), image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=85', likes: 2841, caption: 'The kind of morning that makes you take the long way home.', time: '2 HOURS AGO', comments: ['This is incredible!', 'The colors are unreal.'] },
  { id: '2', user: 'maria.luna', location: 'Lisbon, Portugal', avatar: avatar(32), image: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=85', likes: 1093, caption: 'A little color for your Thursday.', time: '5 HOURS AGO', comments: ['Beautiful place!'] },
  { id: '3', user: 'noahbuilds', location: 'Copenhagen, Denmark', avatar: avatar(12), image: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1200&q=85', likes: 762, caption: 'Design is in the details.', time: '1 DAY AGO', comments: [] },
]
const suggestions = [['lena.studio', 'Followed by maria.luna', 44], ['jordanmakes', 'New to Instagram', 5], ['the.daily.edit', 'Followed by noahbuilds', 16], ['sophiesunday', 'Suggested for you', 25]] as const

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') || fallback } catch { return fallback } }
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

function App() {
  const [user, setUser] = useState<User | null>(() => read<User | null>('ig-user', null))
  const routeView = (): View => {
    const path = routePath()
    if (path === '/explore') return 'explore'
    if (path === '/reels' || path.startsWith('/reel/')) return 'reels'
    if (path === '/direct' || path.startsWith('/direct/')) return 'messages'
    if (path === '/notifications') return 'notifications'
    if (path === '/settings' || path.startsWith('/settings/')) return 'profile'
    if (path === '/profile' || path.startsWith('/p/') || path.startsWith('/tags/')) return 'profile'
    return 'home'
  }
  const [view, setView] = useState<View>(routeView)
  const [posts, setPosts] = useState<Post[]>(() => isSupabaseConfigured ? [] : read('ig-posts', initialPosts))
  const [liked, setLiked] = useState<string[]>(() => isSupabaseConfigured ? [] : read('ig-liked', []))
  const [saved, setSaved] = useState<string[]>(() => isSupabaseConfigured ? [] : read('ig-saved', []))
  const [following, setFollowing] = useState<string[]>(() => isSupabaseConfigured ? [] : read('ig-following', []))
  const [query, setQuery] = useState('')
  const [activeStory, setActiveStory] = useState<number | null>(null)
  const [modal, setModal] = useState<'auth' | 'create' | 'comments' | 'share' | 'settings' | null>(user ? null : 'auth')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [messages, setMessages] = useState<Message[]>(() => isSupabaseConfigured ? [] : read('ig-messages', [{ id: 1, from: 'maria.luna', text: 'Your photos are so beautiful!', time: '10:42 AM' }]))
  const [messageText, setMessageText] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const isRemoteUser = Boolean(isSupabaseConfigured && user && !user.id.startsWith('local-'))

  useEffect(() => { if (!isSupabaseConfigured) write('ig-posts', posts) }, [posts])
  useEffect(() => { if (!isSupabaseConfigured) write('ig-liked', liked) }, [liked])
  useEffect(() => { if (!isSupabaseConfigured) write('ig-saved', saved) }, [saved])
  useEffect(() => { if (!isSupabaseConfigured) write('ig-following', following) }, [following])
  useEffect(() => { if (!isSupabaseConfigured) write('ig-messages', messages) }, [messages])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) { setToast(error.message); return }
      if (data.session?.user && active) {
        try { setUser(await getRemoteProfile(data.session.user)) } catch (profileError) { setToast(profileError instanceof Error ? profileError.message : 'Unable to load your profile.') }
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        if (!read<User | null>('ig-user', null)) setUser(null)
        return
      }
      void getRemoteProfile(session.user).then(profile => { if (active) setUser(profile) }).catch(profileError => setToast(profileError instanceof Error ? profileError.message : 'Unable to load your profile.'))
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!user || !isRemoteUser) return
    let active = true
    void loadFeed(user.id).then(remotePosts => {
      if (!active) return
      setPosts(remotePosts.map(post => ({
        id: post.id,
        user: post.profile.username,
        location: post.location || '',
        avatar: post.profile.avatar_url || avatar(47),
        image: post.media[0]?.media_url || '',
        likes: post.likeCount,
        caption: post.caption,
        time: new Date(post.created_at).toLocaleDateString(),
        comments: post.comments.map(comment => comment.body),
      })))
      setLiked(remotePosts.filter(post => post.liked).map(post => post.id))
    }).catch(error => setToast(error instanceof Error ? error.message : 'Unable to load your feed.'))
    return () => { active = false }
  }, [user, isRemoteUser])
  useEffect(() => {
    if (!user || !isRemoteUser) return
    let active = true
    let channel: ReturnType<typeof subscribeToConversation> | undefined
    void loadMessages(user.id).then(async remoteMessages => {
      if (!active) return
      if (!remoteMessages.length) {
        const { data: other } = await supabase.from('profiles').select('id').neq('id', user.id).limit(1).maybeSingle()
        if (other && active) {
          const directId = await getOrCreateDirectConversation(other.id)
          if (!active) return
          setConversationId(directId)
          channel = subscribeToConversation(directId, incoming => {
            if (String(incoming.sender_id) !== user.id) setMessages(current => [...current, { id: Number.parseInt(String(incoming.id).slice(0, 8), 16), from: 'Message', text: String(incoming.body || ''), time: new Date(String(incoming.created_at)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }])
          })
        }
      }
      setMessages(remoteMessages.map(message => ({
        id: Number.parseInt(message.id.slice(0, 8), 16),
        from: message.sender_id === user.id ? 'You' : 'Message',
        text: message.body || '',
        time: new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      })))
      if (remoteMessages[0]) {
        setConversationId(remoteMessages[0].conversation_id)
        channel = subscribeToConversation(remoteMessages[0].conversation_id, incoming => {
          if (String(incoming.sender_id) === user.id) return
          setMessages(current => [...current, {
            id: Number.parseInt(String(incoming.id).slice(0, 8), 16),
            from: 'Message',
            text: String(incoming.body || ''),
            time: new Date(String(incoming.created_at)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          }])
        })
      }
    }).catch(error => setToast(error instanceof Error ? error.message : 'Unable to load messages.'))
    return () => { active = false; if (channel) void supabase.removeChannel(channel) }
  }, [user, isRemoteUser])

  const toggle = (list: string[], setter: (value: string[]) => void, id: string) => setter(list.includes(id) ? list.filter(item => item !== id) : [...list, id])
  const toggleLike = (post: Post) => {
    const currentlyLiked = liked.includes(post.id)
    toggle(liked, setLiked, post.id)
    if (user && isRemoteUser) {
      void setPostLike(user.id, String(post.id), currentlyLiked).catch(error => {
        toggle(liked, setLiked, post.id)
        setToast(error instanceof Error ? error.message : 'Unable to update like.')
      })
    }
  }
  const toggleSave = (post: Post) => {
    const currentlySaved = saved.includes(post.id)
    toggle(saved, setSaved, post.id)
    if (user && isRemoteUser) {
      void setSavedPost(user.id, String(post.id), currentlySaved).catch(error => {
        toggle(saved, setSaved, post.id)
        setToast(error instanceof Error ? error.message : 'Unable to update saved posts.')
      })
    }
  }
  const notify = (message: string) => setToast(message)
  const navigate = (next: View) => {
    setView(next); setQuery('')
    const paths: Record<View, string> = { home: '/', search: '/search', explore: '/explore', reels: '/reels', messages: '/direct', notifications: '/notifications', profile: '/profile', create: '/create' }
    if (routePath() !== paths[next]) window.history.pushState({}, '', appPath(paths[next]))
  }
  const goHome = () => {
    setView('home')
    setQuery('')
    if (routePath() !== '/') window.history.pushState({}, '', appPath('/'))
  }
  useEffect(() => {
    const onPopState = () => setView(routeView())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const filteredPosts = useMemo(() => posts.filter(post => !query || `${post.user} ${post.location} ${post.caption}`.toLowerCase().includes(query.toLowerCase())), [posts, query])

  const createPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const caption = String(form.get('caption') || '').trim()
    const file = form.get('media')
    let image = String(form.get('image') || '').trim() || 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85'
    if (!caption) return
    if (file instanceof File && file.size > 0) {
      if (user && isRemoteUser) {
        try { image = (await uploadMedia(user.id, 'posts', file, 'draft', 'image')).url } catch (error) { setToast(error instanceof Error ? error.message : 'Unable to upload media.'); return }
      } else image = URL.createObjectURL(file)
    }
    const localPost = { id: String(Date.now()), user: user?.username || 'bilal.ahmed', location: 'Your location', avatar: user?.avatar || avatar(47), image, likes: 0, caption, time: 'JUST NOW', comments: [] }
    if (user && isRemoteUser) {
      void createRemotePost(user.id, caption, image, 'Your location').then(() => {
        setPosts(current => [localPost, ...current]); setModal(null); notify('Your post has been shared.')
      }).catch(error => setToast(error instanceof Error ? error.message : 'Unable to publish your post.'))
      return
    }
    setPosts(current => [localPost, ...current]); setModal(null); notify('Your post has been shared.')
  }
  const sendMessage = (event: FormEvent) => {
    event.preventDefault()
    const body = messageText.trim()
    if (!body) return
    if (user && isRemoteUser && conversationId) {
      void sendRemoteMessage(user.id, conversationId, body).then(() => setMessageText('')).catch(error => setToast(error instanceof Error ? error.message : 'Unable to send message.'))
      return
    }
    setMessages(current => [...current, { id: Date.now(), from: 'You', text: body, time: 'now' }])
    setMessageText('')
  }
  const onAuth = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') || '').replace(/\s/g, '').toLowerCase() || 'bilal.ahmed'
    const name = String(form.get('name') || 'Bilal Ahmed')
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')

    const finalizeLocalAuth = () => {
      const newUser = { id: `local-${username}`, username, name: name || username, avatar: avatar(47), password: password || 'demo-password' }
      setUser(newUser)
      write('ig-user', newUser)
      setFollowing(current => current.includes('maria.luna') ? current : [...current, 'maria.luna'])
      setMessages(current => current.some(message => message.from === 'maria.luna') ? current : [...current, { id: Date.now(), from: 'maria.luna', text: `Hey ${username}! I’m Maria. Want to swap stories?`, time: 'now' }])
      setModal(null)
      goHome()
      notify(authMode === 'signup' ? 'Welcome to Instagram demo mode.' : 'Welcome back!')
    }

    if (!isSupabaseConfigured) {
      finalizeLocalAuth()
      return
    }

    if (isSupabaseConfigured) {
      if (authMode === 'login' && (!email || !password)) {
        setAuthMessage('Configured mode requires the account email and password to log in. Username-only sign-in is available only for demo mode.')
        return
      }
      const syntheticEmail = `${username}.${crypto.randomUUID().slice(0, 8)}@users.invalid`
      const syntheticPassword = crypto.randomUUID() + 'Aa1!'
      const operation = authMode === 'signup'
        ? signUpRemote(email || syntheticEmail, password || syntheticPassword, username, name)
        : signInRemote(email, password)
      void operation.then(async result => {
        if (authMode === 'signup' && result.user && !result.session) {
          setAuthMessage(email ? 'Account created. Check your email to confirm your account, then switch to Log in.' : 'Supabase requires email confirmation. Add a real email and sign up again, or disable email confirmation in Supabase Auth settings.')
          setAuthMode('login')
          return
        }
        if (!result.user) {
          finalizeLocalAuth()
          return
        }
        const profile = await getRemoteProfile(result.user)
        setUser(profile)
        setModal(null)
        goHome()
        notify(authMode === 'signup' ? 'Welcome to Instagram!' : 'Welcome back!')
      }).catch(error => {
        const message = error instanceof Error ? error.message : 'Authentication failed.'
        if (authMode === 'signup' && !email && !password) {
          finalizeLocalAuth()
          setToast(`${message} Created a local demo account instead.`)
          return
        }
        setAuthMessage(message)
      })
      return
    }

    finalizeLocalAuth()
  }

  const nav = [
    ['home', House, 'Home'], ['search', Search, 'Search'], ['explore', Compass, 'Explore'], ['reels', Film, 'Reels'],
    ['messages', MessageCircle, 'Messages'], ['notifications', Heart, 'Notifications'], ['create', PlusSquare, 'Create'], ['profile', UserRound, 'Profile'],
  ] as const
  const renderPost = (post: Post) => <article className="post" key={post.id}>
    <div className="post-header"><button className="post-user post-user-button" onClick={() => navigate(post.user === user?.username ? 'profile' : 'search')}><img src={post.avatar} alt="" /><span><strong>{post.user}</strong><small>{post.location}</small></span></button><button className="icon-button" aria-label="More options" onClick={() => setModal('settings')}><MoreHorizontal size={21} /></button></div>
    <button className="post-media-button" onDoubleClick={() => toggleLike(post)} onClick={() => post.video && navigate('reels')}><img className="post-image" src={post.image} alt={`${post.location} by ${post.user}`} />{post.video && <span className="media-badge"><Film size={17} /></span>}</button>
    <div className="post-body"><div className="post-actions"><div><button className={`icon-button ${liked.includes(post.id) ? 'liked' : ''}`} onClick={() => toggleLike(post)} aria-label="Like"><Heart size={25} fill={liked.includes(post.id) ? 'currentColor' : 'none'} /></button><button className="icon-button" onClick={() => { setSelectedPost(post); setModal('comments') }} aria-label="Comment"><MessageCircle size={25} /></button><button className="icon-button" onClick={() => { setSelectedPost(post); setModal('share') }} aria-label="Share"><Send size={24} /></button></div><button className={`icon-button ${saved.includes(post.id) ? 'saved' : ''}`} onClick={() => { toggleSave(post); notify(saved.includes(post.id) ? 'Removed from saved' : 'Saved to your collection') }} aria-label="Save"><Bookmark size={24} fill={saved.includes(post.id) ? 'currentColor' : 'none'} /></button></div><button className="likes" onClick={() => notify(`${post.likes + (liked.includes(post.id) ? 1 : 0)} people like this`)}>{(post.likes + (liked.includes(post.id) ? 1 : 0)).toLocaleString()} likes</button><p><strong>{post.user}</strong> {post.caption}</p>{post.comments.length > 0 && <button className="comments" onClick={() => { setSelectedPost(post); setModal('comments') }}>View all {post.comments.length + 40} comments</button>}<div className="timestamp">{post.time}</div></div>
  </article>

  if (!user) return <AuthScreen mode={authMode} setMode={mode => { setAuthMode(mode); setAuthMessage('') }} message={authMessage} onSubmit={onAuth} onReset={async email => { if (!isSupabaseConfigured) { setAuthMessage('Password recovery requires Supabase configuration.'); return } try { await sendPasswordReset(email); setAuthMessage('If that email exists, a reset link is on the way.') } catch (error) { setAuthMessage(error instanceof Error ? error.message : 'Unable to send reset email.') } }} />
  return <div className="app-shell">
    <aside className="sidebar"><button className="brand brand-button" onClick={() => navigate('home')}>Instagram</button><nav>{nav.map(([key, Icon, label]) => <button key={key} className={`nav-item ${view === key ? 'active' : ''}`} onClick={() => key === 'create' ? setModal('create') : navigate(key)}><Icon size={22} fill={key === 'home' && view === 'home' ? 'currentColor' : 'none'} /><span>{label}</span>{key === 'messages' && <b className="notification">1</b>}</button>)}</nav><button className="nav-item more" onClick={() => setModal('settings')}><Menu size={22} /><span>More</span></button></aside>
    <main className="main-content"><header className="mobile-header"><button className="brand brand-button" onClick={() => navigate('home')}>Instagram</button><div className="mobile-actions"><button onClick={() => navigate('notifications')} aria-label="Notifications"><Heart size={22} /></button><button onClick={() => navigate('messages')} aria-label="Messages"><MessageCircle size={22} /></button></div></header>
      {view === 'home' && <div className="feed-layout"><section className="feed"><div className="mobile-search"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" /></div><section className="stories-panel"><div className="stories-row">{initialStories.map((story, index) => <button className="story" key={story.user} onClick={() => setActiveStory(index)}><span className={`story-ring ${story.own ? 'own' : ''}`}><img src={story.image} alt="" />{story.own && <i>+</i>}</span><span>{story.user}</span></button>)}</div></section>{filteredPosts.map(renderPost)}</section><Suggestions following={following} setFollowing={setFollowing} onSeeAll={() => navigate('search')} /></div>}
      {view === 'search' && <SearchView query={query} setQuery={setQuery} posts={posts} onPost={post => { setSelectedPost(post); setModal('comments') }} />}
      {view === 'explore' && <Explore posts={posts} onPost={post => { setSelectedPost(post); setModal('comments') }} />}
      {view === 'reels' && <Reels posts={posts} liked={liked} toggleLike={(id) => toggle(liked, setLiked, id)} />}
      {view === 'messages' && <Messages messages={messages} text={messageText} setText={setMessageText} onSend={sendMessage} />}
      {view === 'notifications' && <Notifications following={following} />}
      {view === 'profile' && <Profile user={user} posts={posts.filter(post => post.user === user.username)} onCreate={() => setModal('create')} onLogout={() => { localStorage.removeItem('ig-user'); setUser(null); setModal('auth') }} />}
    </main>
    <nav className="mobile-bottom-nav">{nav.slice(0, 4).map(([key, Icon]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => navigate(key)} aria-label={key}><Icon size={23} fill={key === 'home' && view === 'home' ? 'currentColor' : 'none'} /></button>)}<button onClick={() => navigate('profile')} aria-label="Profile"><img src={user.avatar} alt="" /></button></nav>
    {activeStory !== null && <StoryViewer index={activeStory} onClose={() => setActiveStory(null)} />}
    {modal === 'auth' && <AuthScreen mode={authMode} setMode={mode => { setAuthMode(mode); setAuthMessage('') }} message={authMessage} onSubmit={onAuth} onReset={async email => { if (!isSupabaseConfigured) { setAuthMessage('Password recovery requires Supabase configuration.'); return } try { await sendPasswordReset(email); setAuthMessage('If that email exists, a reset link is on the way.') } catch (error) { setAuthMessage(error instanceof Error ? error.message : 'Unable to send reset email.') } }} />}
    {modal === 'create' && <Modal title="Create new post" onClose={() => setModal(null)}><form className="modal-form" onSubmit={event => void createPost(event)}><label>Upload image<input name="media" type="file" accept="image/*" /></label><label>Or use image URL<input name="image" placeholder="Paste an image URL (optional)" /></label><label>Caption<textarea name="caption" placeholder="Write a caption..." autoFocus /></label><button className="primary-button" type="submit">Share</button></form></Modal>}
    {modal === 'comments' && selectedPost && <Modal title="Comments" onClose={() => setModal(null)}><div className="comments-list">{selectedPost.comments.map((comment, i) => <p key={i}><strong>{i ? 'maria.luna' : selectedPost.user}</strong> {comment}</p>)}</div><form className="comment-form" onSubmit={e => { e.preventDefault(); const input = e.currentTarget.elements.namedItem('comment') as HTMLInputElement; const body = input.value.trim(); if (!body) return; if (user && isRemoteUser) { void addComment(user.id, String(selectedPost.id), body).then(() => { setPosts(current => current.map(post => post.id === selectedPost.id ? { ...post, comments: [...post.comments, body] } : post)); input.value = ''; notify('Comment added') }).catch(error => setToast(error instanceof Error ? error.message : 'Unable to add comment.')); return } setPosts(current => current.map(post => post.id === selectedPost.id ? { ...post, comments: [...post.comments, body] } : post)); input.value = ''; notify('Comment added') }}><input name="comment" placeholder="Add a comment..." /><button type="submit">Post</button></form></Modal>}
    {modal === 'share' && <Modal title="Share to..." onClose={() => setModal(null)}><div className="share-options"><button onClick={() => { setModal(null); navigate('messages'); notify('Choose a chat to send this post') }}><Send /> Send in message</button><button onClick={() => { navigator.clipboard?.writeText(location.href); setModal(null); notify('Link copied to clipboard') }}>🔗 Copy link</button></div></Modal>}
    {modal === 'settings' && <Modal title="Settings" onClose={() => setModal(null)}><div className="settings-list"><button onClick={() => notify('Your account is private')}>Privacy</button><button onClick={() => notify('Notifications are enabled')}>Notifications</button><button onClick={() => notify('Help center opened')}>Help</button><button className="danger" onClick={() => { localStorage.removeItem('ig-user'); if (isSupabaseConfigured) void supabase.auth.signOut(); setUser(null); setModal('auth') }}>Log out</button></div></Modal>}
    {toast && <div className="toast">{toast}</div>}
  </div>
}

function AuthScreen({ mode, setMode, message, onSubmit, onReset }: { mode: 'login' | 'signup'; setMode: (mode: 'login' | 'signup') => void; message: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReset: (email: string) => Promise<void> }) {
  const [reset, setReset] = useState(false)
  const [email, setEmail] = useState('')
  if (reset) return <div className="auth-screen"><div className="auth-card"><div className="auth-logo">Instagram</div><p>Enter your email and we will send a password reset link.</p><form onSubmit={event => { event.preventDefault(); void onReset(email) }}><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" required /><button className="primary-button" type="submit">Send reset link</button></form><div className="auth-switch"><button onClick={() => setReset(false)}>Back to login</button></div></div></div>
  return <div className="auth-screen"><div className="auth-card"><div className="auth-logo">Instagram</div><p>{mode === 'signup' ? 'Create your username and jump in.' : 'Use your username to log in.'}</p>{message && <div className="auth-message" role="status">{message}</div>}<form onSubmit={onSubmit}>{mode === 'signup' && <input name="name" placeholder="Display name (optional)" />}{mode === 'signup' && <input name="username" placeholder="Username" required />}{mode === 'login' && <input name="username" placeholder="Username" required />}<input name="email" type="email" placeholder="Email (optional)" /><input name="password" type="password" placeholder="Password (optional)" /><button className="primary-button" type="submit">{mode === 'signup' ? 'Create account' : 'Log in'}</button></form><div className="auth-hint">No email confirmation needed for demo mode.</div>{mode === 'login' && <button className="forgot-button" onClick={() => setReset(true)}>Forgot password?</button>}<div className="auth-switch">{mode === 'signup' ? 'Have an account?' : "Don't have an account?"} <button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Log in' : 'Sign up'}</button></div></div></div>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onClick={onClose}><section className="modal-card" onClick={e => e.stopPropagation()}><header><strong>{title}</strong><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>{children}</section></div> }
function StoryViewer({ index, onClose }: { index: number; onClose: () => void }) { const story = initialStories[index]; return <div className="story-modal" onClick={onClose}><div className="story-viewer" onClick={e => e.stopPropagation()}><div className="story-progress"></div><div className="story-viewer-header"><span>{story.user}</span><button onClick={onClose}>Close</button></div><img src={story.image} alt="" /><button className="story-prev" onClick={onClose}><ChevronLeft /></button><button className="story-next" onClick={onClose}><ChevronRight /></button></div></div> }
function Suggestions({ following, setFollowing, onSeeAll }: { following: string[]; setFollowing: (items: string[]) => void; onSeeAll: () => void }) { return <aside className="right-rail"><div className="profile-row"><img src={avatar(47)} alt="" /><div><strong>bilal.ahmed</strong><span>Bilal Ahmed</span></div><button onClick={onSeeAll}>Switch</button></div><div className="suggestions-heading"><span>Suggested for you</span><button onClick={onSeeAll}>See all</button></div>{suggestions.map(([name, note, image]) => <div className="suggestion" key={name}><img src={avatar(image)} alt="" /><div><strong>{name}</strong><span>{note}</span></div><button onClick={() => setFollowing(following.includes(name) ? following.filter(item => item !== name) : [...following, name])}>{following.includes(name) ? 'Following' : 'Follow'}</button></div>)}<p className="footer-note">About · Help · Press · API · Jobs · Privacy · Terms<br />Locations · Language · Meta Verified<br /><br />© 2026 INSTAGRAM CLONE</p></aside> }
function SearchView({ query, setQuery, posts, onPost }: { query: string; setQuery: (value: string) => void; posts: Post[]; onPost: (post: Post) => void }) { const results = posts.filter(post => `${post.user} ${post.caption}`.toLowerCase().includes(query.toLowerCase())); return <section className="full-view search-view"><div className="view-heading"><h1>Search</h1><div className="large-search"><Search size={19} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" /></div></div>{query ? <div className="search-results">{results.map(post => <button key={post.id} onClick={() => onPost(post)}><img src={post.avatar} alt="" /><span><strong>{post.user}</strong><small>{post.caption}</small></span></button>)}</div> : <p className="empty-state">Search for people, tags, and places.</p>}</section> }
function Explore({ posts, onPost }: { posts: Post[]; onPost: (post: Post) => void }) { return <section className="full-view"><div className="view-title"><Compass /> Explore</div>{posts.length ? <div className="explore-grid">{posts.map(post => <button key={post.id} onClick={() => onPost(post)}><img src={post.image} alt="" /></button>)}</div> : <p className="empty-state">Explore posts from people you follow.</p>}</section> }
function Reels({ posts, liked, toggleLike }: { posts: Post[]; liked: string[]; toggleLike: (id: string) => void }) { return <section className="full-view reels-view"><div className="view-title"><Film /> Reels</div>{posts.map(post => <article className="reel" key={post.id}><img src={post.image} alt="" /><div className="reel-overlay"><strong>{post.user}</strong><p>{post.caption}</p><button onClick={() => toggleLike(post.id)}><Heart fill={liked.includes(post.id) ? 'currentColor' : 'none'} /> {post.likes + (liked.includes(post.id) ? 1 : 0)}</button><button><MessageCircle /> Comment</button></div></article>)}</section> }
function Messages({ messages, text, setText, onSend }: { messages: Message[]; text: string; setText: (value: string) => void; onSend: (event: FormEvent) => void }) { return <section className="full-view messages-view"><header><div><strong>Messages</strong><small>bilal.ahmed</small></div><button><Settings size={21} /></button></header><div className="message-thread">{messages.map(message => <div className={`message ${message.from === 'You' ? 'mine' : ''}`} key={message.id}><img src={avatar(message.from === 'You' ? 47 : 32)} alt="" /><span><strong>{message.from}</strong>{message.text}<small>{message.time}</small></span></div>)}</div><form className="message-compose" onSubmit={onSend}><Smile size={21} /><input value={text} onChange={e => setText(e.target.value)} placeholder="Message..." /><button type="submit">Send</button></form></section> }
function Notifications({ following }: { following: string[] }) { return <section className="full-view notifications-view"><h1>Notifications</h1><div className="notification-card"><Heart fill="#ed4956" color="#ed4956" /><p><strong>maria.luna</strong> liked your photo <small>2h</small></p><img src={avatar(32)} alt="" /></div>{following.map(name => <div className="notification-card" key={name}><UserRound /><p><strong>{name}</strong> started following you <small>today</small></p><button>Following</button></div>)}</section> }
function Profile({ user, posts, onCreate, onLogout }: { user: User; posts: Post[]; onCreate: () => void; onLogout: () => void }) { return <section className="full-view profile-view"><header><img src={user.avatar} alt="" /><div><h1>{user.username}</h1><button onClick={onLogout}>Log out</button></div></header><div className="profile-stats"><b>{posts.length}<small>posts</small></b><b>1,248<small>followers</small></b><b>312<small>following</small></b></div><button className="edit-profile" onClick={onCreate}>+ Create a post</button><div className="profile-grid">{posts.map(post => <img key={post.id} src={post.image} alt="" />)}</div></section> }

export default App
