const debug = require("debug")("workshop:client")
import * as events from "events"
const hyperlog = require("hyperlog")
const sub = require("subleveldown")
const wswarm = require("webrtc-swarm")
const shasum = require("shasum")
const signalhub = require("signalhub")
const has = require("has")

export type IClientOptions = {
    db: LevelUp
    user: string
    hubs?: string[]
    wrtc?: any
}

export type ILog = {
    time: number
    user: string
    data: any[] | string
}

export class Client extends events.EventEmitter {
    db: LevelUp
    user: string

    logs = {}
    swarms = {}
    peers = {}
    onswarm = {}
    ondisconnect = {}

    hubs = [ "https://sdf.party" ]
    wrtc: any

    constructor(opts: IClientOptions) {
        super()

        this.db = opts.db
        this.user = opts.user

        if (opts.hubs) {
            this.hubs = opts.hubs
        }

        if (opts.wrtc) {
            this.wrtc = opts.wrtc
        }
    }

    join(channel: string): void {
        debug("joining channel %s", channel)

        if (channel === "!status" || has(this.swarms, channel)) {
            return void this.emit("join", channel)
        }

        this.logs[channel] = hyperlog(sub(this.db, channel), { valueEncoding: "json" })

        this.logs[channel]
            .createReadStream({ live: true })
            .on("data", row => {
                debug("onlogdata %s %O", channel, row)
                this.emit("change", channel, row.value) // {data, time, user}
            })

        const hub = signalhub(shasum("evan." + channel), this.hubs)
        const swarm = wswarm(hub, { wrtc: this.wrtc })

        this.swarms[channel] = swarm
        this.peers[channel] = {}
        this.onswarm[channel] = (peer, id) => {
            debug("onswarm %s %s", channel, id)

            this.emit("peer", channel, id)
            this.peers[channel][id] = peer

            const logstream = this.logs[channel].replicate({ live: true })

            logstream.on("error", err => {
                debug("logstream err 1 %s", err)
            })

            peer.on("error", err => {
                debug("peer err 1 %s", err)
            })

            const s = peer.pipe(logstream);

            s.on("error", err => {
                debug("stream err 1 %s", err)
            })

            s.pipe(peer)
        }

        this.ondisconnect[channel] = (peer, id) => {
            debug("ondisconnect %s %s %s", channel, peer, id)

            this.emit("disconnect", channel, id)

            delete this.peers[channel][id]
        }

        swarm.on("peer", this.onswarm[channel])
        swarm.on("disconnect", this.ondisconnect[channel])

        this.emit("join", channel)
    }

    part(channel: string) {
        debug("parting channel %s", channel)

        if (!has(this.swarms, channel)) {
            return
        }

        delete this.logs[channel]
        this.swarms[channel].removeListener("peer", this.onswarm[channel])
        this.swarms[channel].removeListener("peer", this.ondisconnect[channel])
        delete this.swarms[channel]
        delete this.onswarm[channel]
        delete this.ondisconnect[channel]

        Object.keys(this.peers[channel]).forEach(key => {
            this.peers[channel][key].destroy()
        })

        delete this.peers[channel]
        this.emit("part", channel)
    }

    send(channel: string, value: any) {
        if (!has(this.logs, channel)) {
            return
        }

        const log: ILog = {
            time: Date.now(),
            user: this.user,
            data: value
        }

        debug("sending %o", log)
        this.logs[channel].append(log, function (err, node) {})
    }
}

