let counter = 0

function getId() {
    return ++counter
}

class Command {
    constructor(id, name, ...args) {
        this.internalId = getId()
        this.id = id
        this.name = name
        this.arguments = args || []
    }

    toString() {
        return `${this.id != null ? this.id : ''} ${this.name} ${this.arguments.join(' ')}`.trim()
    }
}

module.exports = Command
