const debug = require("debug")("workshop:main")
window["debug"] = require("debug")

import * as React from "react"
import * as ReactDOM from "react-dom"
import {Client} from "./client"
import {Sidebar} from "./sidebar"
import {Chat, IChatLog} from "./chat"
import {observable, action, extendObservable} from "mobx"
import {observer} from "mobx-react"
const randomBytes = require("randombytes")
const memdb = require("memdb")
const uniq = require("uniq")
const debounce = require("debounce")
const {Layout, LayoutSplitter} = require("react-flex-layout")
const has = require("has")

const motd = require("./motd")

const styles = require("./styles.scss")

type IApplicationState = {
    channels: string[]
    channel: string // active channel
    peers: string[]
    logs: { [channel: string]: IChatLog[] }
    scroll: { [channel: string]: number }
    heights: { [channel: string]: { client: number, scroll: number } }
    activity: { [channel: string]: boolean | "mentioned" | "activity" }
    user: string
    ui: {
        screenSize: {
            width: number
            height: number
        }
    }
}

const DEFAULT_CHANNEL = "!status"

@observer
class Main extends React.Component<any, void> {
    refs: { chat: Chat }

    @observable appState: IApplicationState = {
        channels: [],
        channel: window.location.hash || DEFAULT_CHANNEL,
        peers: [],
        logs: {},
        scroll: {},
        activity: {},
        heights: {},
        user: randomBytes(3).toString("hex"),
        ui: {
            screenSize: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        }
    }
    db: any = memdb()
    client: Client

	@action setCurrentChannel(channel) {
		if (!channel) {
			return
		}

		if (channel === DEFAULT_CHANNEL) {
			channel = DEFAULT_CHANNEL
            window.location.hash = ""
		} else {
            window.location.hash = channel
        }

		this.appState.channel = channel

        this.appState.peers = has(this.client.peers, channel)
            ? Object.keys(this.client.peers[channel])
            : []

        if (!has(this.appState.logs, channel)) {
            extendObservable(this.appState.logs, {
                [channel]: []
            })
        }

        if (!has(this.appState.scroll, channel)) {
            extendObservable(this.appState.scroll, {
                [channel]: Number.MAX_VALUE
            })
        }

        if (!has(this.appState.activity, channel)) {
            extendObservable(this.appState.activity, {
                [channel]: false
            })
        }

        if (!has(this.appState.heights, channel)) {
            extendObservable(this.appState.heights, {
                [channel]: false
            })
        }

        this.appState.activity[channel] = false
	}

    handleWindowHashChange = () => {
        const h = window.location.hash
        if (!h) {
            return
        }

        if (h !== this.appState.channel) {
            this.client.join(h)
        }
    }

    handleWindowResize = debounce(() => {
        this.appState.ui.screenSize = getScreenSize()
        debug("resize window")
    }, 200, false)

    handleSidebarSelect = (channel) => {
        debug("selecting channel: %s", channel)
        if (!channel) {
            return
        }

        this.setCurrentChannel(channel)
    }

    handleJoinChannel = (channel) => {
        debug("joined %s", channel)

        const {channels} = this.appState
		channels.push(channel)
		uniq(channels)
		this.setCurrentChannel(channel)
    }

    handlePartChannel = (channel) => {
        debug("part %s", channel)
        const {channels} = this.appState
        const ix = channels.indexOf(channel)
        if (ix >= 0) {
            channels.splice(ix, 1)
        }

        this.setCurrentChannel(channels[Math.max(0, ix-1)] || "!status")
    }

    handlePeerConnect = (channel: string, id: string) => {
        debug("peer connect %s %s", channel, id)

        this.appState.peers.push(id)
    }

    handlePeerDisconnect = (channel: string, id: string) => {
        debug("peer disconnect %s %s", channel, id)

        const {peers} = this.appState
        const ix = peers.indexOf(channel)
        if (ix >= 0) {
            peers.splice(ix, 1)
        }
    }

    componentDidMount() {
		const client = new Client({
            user: this.appState.user,
            db: this.db
        })

        this.client = client

		client.on("join", this.handleJoinChannel)
		client.on("part", this.handlePartChannel)

        client.on("peer", this.handlePeerConnect)
        client.on("disconnect", this.handlePeerDisconnect)

        client.on("change", (channel: string, row: IChatLog) => {
            debug("change %s %O", channel, row)
            this.appState.logs[channel].push(row)
            this.appState.logs[channel].sort((a, b) => {
                return a.time < b.time ? -1 : 1
            })

            const nym = RegExp("\\b" + client.user + "\\b")
            if (this.appState.channel !== channel) {
                this.appState.activity[channel] = nym.test(row.data)
                    ? "mentioned"
                    : "activity"
            }

            const lines: HTMLDivElement = this.refs.chat.refs.lines
            if (lines.scrollHeight - lines.clientHeight === lines.scrollTop) {
                // at bottom, scroll to bottom
                this.appState.scroll[channel] = Number.MAX_VALUE
            }

            this.appState.heights[this.appState.channel] = {
                client: lines.clientHeight,
                scroll: lines.scrollHeight
            }
            lines.scrollTop = this.appState.scroll[this.appState.channel]
        })

		const h = window.location.hash
		if (h && h !== "#") {
            this.appState.channels.push(DEFAULT_CHANNEL)
			client.join(h)
		} else {
            client.join(DEFAULT_CHANNEL)
        }

        this.addWindowListeners()

        window["state"] = this.appState
        window["client"] = this.client

        this.showMotd()
    }

    handleMessage = (msg: string) => {
        debug("msg \"%s\"", msg)

        const client = this.client
        const state = this.appState

        const m = /^\/(\S+)/.exec(msg)
        const cmd = (m && m[1] || '').toLowerCase()

        if (cmd === "join" || cmd === "j") {
            client.join(msg.split(/\s+/)[1] || state.channel)
        } else if (cmd === "part" || cmd === "p") {
            client.part(msg.split(/\s+/)[1] || state.channel)
        } else if (cmd === "nick" || cmd === "n") {
            client.user = msg.split(/\s+/)[1]
            debug("change nickname: %s", client.user)
        } else if (cmd === "help" || cmd === "h") {
            this.showMotd()
        } else if (cmd) {
            // unknown command
            debug("unknown command %s", cmd)
        } else if (state.channel !== "!status") {
            client.send(state.channel, msg)
        }
    }

    handleKeyDown = (ev) => {
        if (!ev.ctrlKey) {
            this.refs.chat.refs.input.focus()
        }

        const {channels, scroll, channel, heights} = this.appState

        const code = ev.keyCode || ev.which
        const h = heights[channel]
        if (h && code === 33) { // PgUp
            ev.preventDefault()
            scroll[channel] -= h.client
        } else if (h && code === 34) { // PgDown
            ev.preventDefault()
            scroll[channel] += h.client
        } else if (ev.ctrlKey && (code === 74 || code === 40)) { // ^down, ^j
            ev.preventDefault()
            var ix = channels.indexOf(channel)
            this.setCurrentChannel(channels[(ix + 1) % channels.length])
        } else if (ev.ctrlKey && (code === 75 || code === 38)) { // ^up, ^k
            ev.preventDefault()
            var ix = channels.indexOf(channel)
            this.setCurrentChannel(channels[(ix - 1) % channels.length])
        }
    }


    addWindowListeners() {
		window.addEventListener("hashchange", this.handleWindowHashChange)
        window.addEventListener("resize", this.handleWindowResize)
        window.addEventListener("keydown", this.handleKeyDown)
    }

    removeWindowListeners() {
        window.removeEventListener("hashchange", this.handleWindowHashChange)
        window.removeEventListener("resize", this.handleWindowResize)
        window.removeEventListener("keydown", this.handleKeyDown)
    }

    showMotd() {
        motd.split("\n").forEach(this.showInfo)
    }

    showInfo = (msg: string) => {
        const state = this.appState

        let lines = state.logs[DEFAULT_CHANNEL]
        if (!lines) {
            lines = state.logs[DEFAULT_CHANNEL] = []
        }

        lines.push({
            time: Date.now(),
            user: "!info",
            data: msg
        })
    }

    componentWillUnMount() {
        this.removeWindowListeners()
    }

	render() {
        const {channels, channel, user, peers, logs, activity} = this.appState

        return <Layout fill="window">

                <Layout layoutWidth={200}>
                    <Sidebar
                        channel={channel}
                        channels={channels}
                        onSelect={this.handleSidebarSelect}
                        activity={activity}
                        />
                </Layout>

                <LayoutSplitter />

                <Layout layoutWidth="flex">

                    <div className={styles.content}>
                        <Chat
                            channel={channel}
                            peers={peers}
                            user={user}
                            logs={logs[channel]}
                            onMessage={this.handleMessage}
                            ref="chat"
                            />
                    </div>

                </Layout>

		</Layout>
	}
}

ReactDOM.render(<Main />, document.getElementById("main"))

function getScreenSize() {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    }
}