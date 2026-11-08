using System.Collections.ObjectModel;

namespace soft.square.net.Share.All.Abstractions.Interfaces;

public interface IRecursiveDataItem<TId, TSelf>  
    where TId :  IEquatable<TId>
    where TSelf : IRecursiveDataItem<TId, TSelf>
{
    public TId Id { get; }
    public TId ParentId { get; }
    public string Title { get; set; }
    public int Level { get; set; } 
    public int Order { get; set; }
    public virtual string Name => Title;
    public bool IsRoot => Parent is null;
    public TSelf? Parent { get;}
    protected HashSet<TSelf> _children { get; } 
    IReadOnlyCollection<TSelf> Children { get; }

    public TId AddChild(TSelf child);

    public void RemoveChild(TSelf child);

    public void ClearCHildren();

    public TSelf DeepClone();
    
    // 1. Overloading the == Operator
    public static virtual bool operator ==(TSelf? left, TSelf? right)
    {
        // CRUCIAL: Use 'is null' here. Do NOT write 'left == null' or it will cause an infinite loop!
        if (left is null && right is null) return true;
        if (left is null || right is null) return false;

        return left.Equals(right);
    }

    // 2. Overloading the != Operator
    public static virtual bool operator !=(TSelf? left, TSelf? right)
    {
        return !(left == right);
    }

    // 3. Implementing IEquatable<Product>.Equals (Strongly typed)
    public virtual bool Equals(TSelf? other)
    {
        if (other is null) return false;
        if (ReferenceEquals(this, other)) return true;

        // Domain-driven equality: products are equal if their IDs match
        return Id.Equals(other!.Id);
    }

    // 4. Overriding Object.Equals (Mandatory when overloading ==)
    public virtual bool Equals(object? obj)
    {
        return Equals(obj);
    }

    // 5. Overriding GetHashCode (Mandatory when overriding Equals)
    public  int GetHashCode()
    {
        return Id.GetHashCode();
    }
}
