var PS4RTE = function(ip)
{
    this.base = "http://" + ip + ":771/";

    this.GetProcessList = function(callback, failure)
    {
        return $.get(this.base + "list", callback).fail(failure);
    };

    this.GetProcessInfo = function(pid, callback, failure)
    {
        return $.get(this.base + "info?pid=" + pid, callback).fail(failure);
    };

    this.GetProcessMaps = function(pid, callback, failure)
    {
        return $.get(this.base + "mapping?pid=" + pid, callback).fail(failure);
    };

    this.ReadMemory = function(pid, address, length, callback, failure)
    {
        return $.get(this.base + "read?pid=" + pid + "&address=" + address + "&length=" + length, callback).fail(failure);
    };

    this.WriteMemory = function(pid, address, data, length, callback, failure)
    {
        return $.get(this.base + "write?pid=" + pid + "&address=" + address + "&data=" + data + "&length=" + length, callback).fail(failure);
    };

    this.AllocateMemory = function(pid, length, callback, failure)
    {
        return $.get(this.base + "alloc?pid=" + pid + "&length=" + length, callback).fail(failure);
    };

    this.FreeMemory = function(pid, address, length, callback, failure)
    {
        return $.get(this.base + "free?pid=" + pid + "&address=" + address + "&length=" + length, callback).fail(failure);
    };

    this.PauseProcess = function(pid, callback, failure)
    {
        return $.get(this.base + "pause?pid=" + pid, callback).fail(failure);
    };

    this.ResumeProcess = function(pid, callback, failure)
    {
        return $.get(this.base + "resume?pid=" + pid, callback).fail(failure);
    };

    this.Notify = function(messageType, message, callback, failure)
    {
        return $.get(this.base + "notify?messageType=" + messageType + "&message=" + btoa(message + "\x00"), callback).fail(failure);
    };

};

var ProcessList		= null;
var ProcessInfo		= null;
var ProcessMaps		= null;
var SelectedProcess	= null;
var PS4 = null;
function FailCallback()
{

    if (typeof ProcessList.reject == 'function') {
        ProcessList.reject();
    }
    ProcessInfo.reject();
    ProcessMaps.reject();
}
function GetProcessListCallback(data)
{
    ProcessList.resolve(data);
}
function GetProcessInfoCallback(data)
{
    ProcessInfo.resolve(data);
}
function GetProcessMapsCallback(data)
{
    ProcessMaps.resolve(data);
}
function HexStringToBase64(str)
{
    var result = [];
    while (str.length >= 2)
    {
        result.push(parseInt(str.substring(0, 2), 16));
        str = str.substring(2);
    }
    return btoa(String.fromCharCode.apply(null, new Uint8Array(result)));
}
function zeroFill(number, width, swap) {
    width -= number.toString().length;

    if (width > 0) {
        return new Array(width + (/\./.test(number) ? 2 : 1)).join('0') + number;
    }
    if(swap)
    {
        number = number.match(/.{2}/g);
        number = number.reverse().join("");
    }
    return number + ""; // always return a string
}
function GetNthEntry(n)
{
    if(ProcessMaps != null)
    {
        return ProcessMaps[n].start;
    }
    return null;
}
function FindBase()
{
    var base = null;
    ProcessMaps.some(function(entry)
    {
        if(entry.name === "executable" && entry.prot === 5)
        {
            base = entry;
            return true;
        }
        return false;
    });
    if(base != null)
    {
        return base.start;
    }
    return null;
}
function FindProcess(name)
{
    var proc = null;
    ProcessList.some(function(process)
    {
        if(process.name === name)
        {
            proc = process;
            return true;
        }
        return false;
    });
    return proc;
}
function FillDialog(cheat, index) {

    var name = cheat.name;
    var content;
    switch(cheat.type)
    {
        case "checkbox":
            content = $('<div><label class="switch"><input class="chbox" id="' + index + '" type="checkbox"><span class="slider"></span></label>' + name + '</div>');
            break;
        case "button":
            content = $('<div><label class="switch"><button class="btn btn-primary" id="'+ index +'" type="button">'+ name +'</button></label></div>');
            break;
    }
    $("#mods").append(content);
}
function WriteMemory(memory, activated)
{
    var base = null;
    if(memory.section === undefined || memory.section === 0)
    {
        base = bigInt(FindBase());
    }
    else
    {
        base = bigInt(GetNthEntry(memory.section));
    }
    var offset = bigInt(memory.offset, 16);
    var address = (base.add(offset));
    var hex;
    if(activated)
    {
        hex = memory.on;
    }
    else
    {
        hex = memory.off;
    }
    var data = HexStringToBase64(hex);
    var length = hex.length / 2;
    PS4.WriteMemory(SelectedProcess.pid, address.toString(10), data, length);
}
function HandleMasterCode(master, cheats)
{
    PS4.AllocateMemory(SelectedProcess.pid, 0x1, function(data)
    {
        if(master.challenged === undefined || master.challenged !== "yes")
        {
            var address =  bigInt(data.address).plus(8).toString(16);
            address = zeroFill(address, 16, true);
            cheats.forEach(function(cheat)
            {
                cheat.memory.forEach(function(mem)
                {
                    mem.on = mem.on.replace("{ALLOC}", address);
                });

            });
            master.memory.forEach(function(element)
            {
                element.on = element.on.replace("{ALLOC}", address);
            });
        }
        master.memory.forEach(function(element)
        {
            WriteMemory(element, true);
        });
    });
    //Optimizations? -> Check if memory was already allocated b4 doing this shit
}
function HookMod(mod, index)
{
    var name = mod.name;
    var memory = mod.memory;

    switch(mod.type)
    {
        case "checkbox":
            $('#' + index).change(function() {
                var activated = this.checked;
                PS4.PauseProcess(SelectedProcess.pid, null, function()
                {
                    if (memory.length !== undefined)
                    {
                        memory.forEach(function(element, index)
                        {
                            WriteMemory(element, activated);
                        });
                        PS4.ResumeProcess(SelectedProcess.pid);
                        if (activated)
                        {
                            PS4.Notify(222, name + ' |Enabled ');
                        }
                        else
                        {
                            PS4.Notify(222, name + ' |Disabled ');
                        }
                    }
                });
            });
            break;
        case "button":
            $('#' + index).click(function()
            {
                PS4.PauseProcess(SelectedProcess.pid, null, function()
                {
                    if (memory.length !== undefined)
                    {
                        memory.forEach(function(element, index)
                        {
                            WriteMemory(element, true);
                        });

                        PS4.ResumeProcess(SelectedProcess.pid);
                        PS4.Notify(222, name + ' |Enabled ');
                    }
                });
            });
            break;
    }
}
function HandleTrainer(mods)
{

    var good = true;
    if (SelectedProcess == null || typeof ProcessMaps.state == 'function' || typeof ProcessInfo.state == 'function') {
        $("#Message").text("Trainer Failed To Attach.");
        good = false;
    }
    if (mods.length !== undefined)
    {
        mods.forEach(function(mod, index)
        {
            FillDialog(mod, index);
            if(good)
            {
                HookMod(mod, index);
            }
        });
    }
    if(good) {
        $("#Message").text("Trainer Attached");
        PS4.Notify(222, "Trainer Attached");
    }

    $.LoadingOverlay("hide");
    $("#trainer-dialog").modal("show");
}
function CreateCard(trainer)
{
    var cardTemplate = [
        '<div class="trainer-card d-flex flex-wrap rounded m-1 bg-transparent" style="height :128px;" source="',
        trainer.url,
        '" >',
        '<div style="width :130px"><img class="coverholder m-1 rounded lazy" onerror="if (this.src !== \'./error.png\') this.src = \'./error.png\';" data-src="./',
        trainer.title,
        '.jpg" style="width :118px; height :118px;"></div>',
        ' <div class="GInfo m-1 text-white" style="width :220px">',
        '<h5><small class="game">',
        trainer.name,
        '</small></h6>',
        '<h6><small  class="cusa">',
        trainer.title,
        '</small>',
        '<h6><small  class="version">',
        ' v',
        trainer.version,
        '</div>'
    ];

    return $(cardTemplate.join(''));
}
var observer;
$(document).ready(function()
{
    var listUrl = "./list.json";

    $.LoadingOverlay("show", {
        image: "main_loader.gif",
        imageAnimation: "0.8s fadein"
    });

    $.get(listUrl, ListCallback).then(function()
    {
        $("#search-input").on("keyup", SearchCallback);
        $(".trainer-card").click(TrainerClickCallback);

        observer = new LazyLoad({
            elements_selector: ".lazy",
            to_webp: false
        });
    });
    $("#ip").val(localStorage.getItem('ip'));
});
function ListCallback(data)
{
    data.games.sort(function(a , b)
    {
		    var item1 = a.name.toUpperCase();
    var item2 = b.name.toUpperCase();
        if(item1 < item2) { return -1; }
        if(item1 > item2) { return 1; }
        return 0;
    });
    $.each(data.games, function(i, trainer)
    {
        var card = CreateCard(trainer);
        $('#container').append(card);

    });
    $.LoadingOverlay("hide");
}
function SearchCallback()
{
    var input = $("#search-input").val().toLowerCase();
    $(".trainer-card").each(function()
    {
        var source = $(this).find("small").eq(0).html().toLowerCase();
        $(this).removeClass("d-flex");
        $(this).removeClass("d-flex");

        if (source.indexOf(input) > -1)
        {
            $(this).addClass("d-flex");
            $(this).show();
        }
        else
        {
            $(this).hide();
        }
    });
    observer.update();
}

var gcard = null;
var timer = null;


function tCheckCard()
{
	if (gcard) {
		// you click you blow up -js at it's finest
		ProcessList		= null;
		ProcessInfo		= null;
		ProcessMaps		= null;
	
		gcard.click();
		return;
	}
}

function AutoSelectCard(partial)
{
	gcard = null;
    $(ProcessList).each(function(ix,process)	//some(function(process)
    {				
		var defer = PS4.GetProcessInfo(process.pid, GetProcessInfoCallback, FailCallback),
			filtered = defer.then(function (pi) 
		
		{
			var tid = pi.titleid.trim();
			
			if(tid.startsWith(partial))
			{
				$("#list_container .trainer-card").each(function(ix, card) {
					if ($(card).find(".cusa").text() === pi.titleid) {
						gcard = card;
						return false;
					}
				});
			}
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(tCheckCard, 100);

		});
    });
	return gcard;
}


function autoSelGame()
{
	PS4 = new PS4RTE($("#ip").val());
	
    ProcessList		= $.Deferred();
    ProcessInfo		= $.Deferred();
    ProcessMaps		= $.Deferred();
    SelectedProcess	= null;

	
	PS4.GetProcessList(GetProcessListCallback, FailCallback);
	$.when(ProcessList).done(function (pl)
	{
		localStorage.setItem('ip', $("#ip").val());
		ProcessList = pl;
		
		AutoSelectCard("CUSA");
	});
		
}

function TrainerClickCallback()
{
    var trainerUrl = $(this).attr('source');
    PS4 = new PS4RTE($("#ip").val());
    var cusa = $(this).find(".cusa").text();
    $("#cover").attr('data-src', "./" + cusa + ".jpg");
    observer.load($("#cover").get(0), true);
    $.LoadingOverlay("show", {
        image: "main_loader.gif",
        imageAnimation: "0.8s fadein"
    });

    ProcessList		= $.Deferred();
    ProcessInfo		= $.Deferred();
    ProcessMaps		= $.Deferred();
    SelectedProcess	= null;

    $.get(trainerUrl, function(data)
    {
        var mods = data.mods;
        $("#game").attr('process', data.process).text(data.name);
        $("#cusa").text(data.id);
        $("#version").text('v' + data.version);
        $("#credits").text(data.credits);
        $("#mods").empty();
        PS4.GetProcessList(GetProcessListCallback, FailCallback);
        $.when(ProcessList).done(function (v1)
        {
            localStorage.setItem('ip', $("#ip").val());
            ProcessList = v1;
            SelectedProcess = (FindProcess(data.process));
            PS4.GetProcessMaps(SelectedProcess.pid, GetProcessMapsCallback, FailCallback);
            PS4.GetProcessInfo(SelectedProcess.pid, GetProcessInfoCallback, FailCallback);
            $.when(ProcessMaps, ProcessInfo).done(
                function(v2 , v3)
                {
                    ProcessMaps = v2;
                    ProcessInfo = v3;
                    var master = data.master;
                    if(master !== undefined && master.memory.length !== undefined && v1 != null)
                    {
                        HandleMasterCode(master, mods);
                    }

                }).always(function(){HandleTrainer(mods)});
        }).fail(function(){HandleTrainer(mods)});
    });

}